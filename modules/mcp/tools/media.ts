import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import MediaLog, { MEDIA_LOG_STATUSES, MEDIA_LOG_TYPES, type IMediaLog } from "../../media/mediaLog.model";
import * as MediaService from "../../media/media.service";
import * as MetadataService from "../../metadata/metadata.service";
import { METADATA_PROVIDERS } from "../../metadata/metadata.types";
import { NotFoundError, UnprocessableEntityError } from "../../../core/errors/AppError";
import { escapeRegExp } from "../../notes/note.text";
import { compact, idSchema, localDay, resolveDay, run, todayOf, type McpContext } from "../context";

const TYPE_LABEL = { movie: "movie", tvshow: "show", book: "book", music_album: "album", game: "game" } as const;

export const mediaSummary = (log: IMediaLog & { _id: unknown }, ctx: McpContext, withReview = true) =>
  compact({
    id: String(log._id),
    type: log.type,
    title: log.title,
    by: log.director ?? log.author ?? log.artist,
    year: log.releaseYear,
    status: log.status,
    rating: log.rating ? `${log.rating}/10` : undefined,
    date: localDay(log.date, ctx),
    favorite: log.favorite,
    pages: log.pages,
    review: withReview ? log.review : undefined,
  });

const typeSchema = z.enum(MEDIA_LOG_TYPES).describe("movie, tvshow, book, music_album or game");
const statusSchema = z
  .enum(MEDIA_LOG_STATUSES)
  .describe("finished, in_progress, planned (watchlist / backlog) or dropped");
const dateInput = z
  .string()
  .optional()
  .describe("YYYY-MM-DD: finished on, started on, added on or dropped on, depending on status. Default today.");

const toDate = (value: string | undefined, ctx: McpContext) =>
  new Date(`${resolveDay(value ?? todayOf(ctx), ctx, "date")}T12:00:00Z`);

export const registerMediaTools = (server: McpServer, ctx: McpContext) => {
  server.registerTool(
    "search_media",
    {
      title: "Search the media log",
      description:
        "Searches Jules's media log (movies, shows, books, albums, games) by title or creator, type, status, rating or favorite. Without filters, lists the most recent entries.",
      inputSchema: {
        query: z.string().optional().describe("Text in the title, director, author or artist"),
        type: typeSchema.optional(),
        status: statusSchema.optional(),
        favorite: z.boolean().optional(),
        minRating: z.number().int().min(1).max(10).optional(),
        loggedFrom: z.string().optional().describe("Only entries dated on or after this day (YYYY-MM-DD)"),
        loggedTo: z.string().optional().describe("Only entries dated on or before this day"),
        includeReviews: z.boolean().default(true),
        limit: z.number().int().min(1).max(200).default(25),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ query, type, status, favorite, minRating, loggedFrom, loggedTo, includeReviews, limit }) => {
      const filter: Record<string, unknown> = { userId: ctx.userId };
      if (type) filter.type = type;
      if (status) filter.status = status;
      if (favorite !== undefined) filter.favorite = favorite ? true : { $ne: true };
      if (minRating) filter.rating = { $gte: minRating };
      if (loggedFrom || loggedTo) {
        filter.date = {
          ...(loggedFrom ? { $gte: new Date(`${resolveDay(loggedFrom, ctx, "loggedFrom")}T00:00:00Z`) } : {}),
          ...(loggedTo ? { $lte: new Date(`${resolveDay(loggedTo, ctx, "loggedTo")}T23:59:59Z`) } : {}),
        };
      }
      if (query?.trim()) {
        const pattern = new RegExp(escapeRegExp(query.trim()), "i");
        filter.$or = [{ title: pattern }, { director: pattern }, { author: pattern }, { artist: pattern }];
      }
      const [total, logs] = await Promise.all([
        MediaLog.countDocuments(filter),
        MediaLog.find(filter).sort({ date: -1 }).limit(limit).lean(),
      ]);
      return { total, entries: logs.map((log) => mediaSummary(log, ctx, includeReviews)) };
    }),
  );

  server.registerTool(
    "find_in_catalogue",
    {
      title: "Find a title in the catalogues",
      description:
        "Looks a title up in the catalogue Prometheus uses for its type (TMDB for movies and shows, Open Library for books, MusicBrainz for albums, Steam for games). Pass a result's provider and externalId to add_media to fill in the cover, year and credits.",
      inputSchema: { type: typeSchema, query: z.string().min(2).max(200) },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    run(async ({ type, query }) => {
      const results = await MetadataService.searchMetadata(type, query);
      return {
        results: results.slice(0, 10).map((result) =>
          compact({
            provider: result.provider,
            externalId: result.externalId,
            title: result.title,
            year: result.year,
            detail: result.subtitle,
          }),
        ),
      };
    }),
  );

  server.registerTool(
    "add_media",
    {
      title: "Log a movie, show, book, album or game",
      description:
        "Adds an entry to the media log. With a catalogue match (from find_in_catalogue) the title, cover, year, link and credits are filled in; anything you pass overrides them.",
      inputSchema: {
        type: typeSchema,
        title: z.string().max(300).optional().describe("Required without a catalogue match"),
        catalogue: z
          .object({ provider: z.enum(METADATA_PROVIDERS), externalId: z.string().max(100) })
          .optional(),
        status: statusSchema.default("finished"),
        rating: z.number().int().min(1).max(10).optional().describe("1 to 10"),
        review: z.string().max(10_000).optional(),
        date: dateInput,
        favorite: z.boolean().optional(),
        by: z.string().max(200).optional().describe("Director (movie), author (book) or artist (album)"),
        year: z.number().int().min(1000).max(3000).optional(),
        pages: z.number().int().min(1).optional().describe("Books only"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    run(async ({ type, title, catalogue, status, rating, review, date, favorite, by, year, pages }) => {
      const details = catalogue
        ? await MetadataService.getMetadataDetails(catalogue.provider, catalogue.externalId)
        : null;
      const name = title?.trim() || details?.title;
      if (!name) throw new UnprocessableEntityError("Give a title or a catalogue match");

      const input: MediaService.CreateMediaLogInput = {
        type,
        title: name,
        status,
        rating,
        review,
        date: toDate(date, ctx),
        url: details?.url,
        releaseYear: year ?? details?.year,
        external: details ? { provider: details.provider, id: details.externalId } : undefined,
        director: type === "movie" ? (by ?? details?.credits.director) : undefined,
        author: type === "book" ? (by ?? details?.credits.author) : undefined,
        artist: type === "music_album" ? (by ?? details?.credits.artist) : undefined,
        pages: type === "book" ? (pages ?? details?.credits.pages) : undefined,
        cover: details?.coverUrl ? { url: details.coverUrl, source: "external" } : undefined,
      };

      let note: string | undefined;
      let log;
      try {
        log = await MediaService.createLog(input, ctx.userId);
      } catch (error) {
        if (!(error instanceof UnprocessableEntityError) || !input.cover) throw error;
        // A cover that can't be copied shouldn't cost the whole entry.
        log = await MediaService.createLog({ ...input, cover: undefined }, ctx.userId);
        note = "Saved without a cover: the catalogue image couldn't be imported.";
      }
      if (favorite) log = await MediaService.toggleFavorite(String(log._id), ctx.userId);
      return compact({ ...mediaSummary(log.toObject(), ctx), cover: Boolean(log.cover), note });
    }),
  );

  server.registerTool(
    "update_media",
    {
      title: "Update a media log entry",
      description:
        "Changes an entry: status (e.g. planned to finished), rating (null clears it), review, date, favorite, title or credits.",
      inputSchema: {
        id: idSchema,
        status: statusSchema.optional(),
        rating: z.number().int().min(1).max(10).nullable().optional(),
        review: z.string().max(10_000).optional().describe("Replaces the review; \"\" clears it"),
        date: dateInput,
        favorite: z.boolean().optional(),
        title: z.string().min(1).max(300).optional(),
        type: typeSchema.optional(),
        by: z.string().max(200).optional(),
        year: z.number().int().min(1000).max(3000).nullable().optional(),
        pages: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    run(async ({ id, status, rating, review, date, favorite, title, type, by, year, pages }) => {
      const current = await MediaLog.findOne({ _id: id, userId: ctx.userId }).lean();
      if (!current) throw new NotFoundError("Media log entry");
      const kind = type ?? current.type;
      let log = await MediaService.updateLog(id, ctx.userId, {
        ...(status !== undefined ? { status } : {}),
        ...(rating !== undefined ? { rating } : {}),
        ...(review !== undefined ? { review } : {}),
        ...(date !== undefined ? { date: toDate(date, ctx) } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(year !== undefined ? { releaseYear: year } : {}),
        ...(by !== undefined
          ? kind === "movie"
            ? { director: by }
            : kind === "book"
              ? { author: by }
              : kind === "music_album"
                ? { artist: by }
                : {}
          : {}),
        ...(pages !== undefined ? { pages } : {}),
      });
      if (favorite !== undefined && favorite !== log.favorite) {
        log = await MediaService.toggleFavorite(id, ctx.userId);
      }
      return mediaSummary(log.toObject(), ctx);
    }),
  );

  server.registerTool(
    "delete_media",
    {
      title: "Delete a media log entry",
      description: "Deletes an entry and its stored cover, for good.",
      inputSchema: { id: idSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    run(async ({ id }) => {
      const log = await MediaLog.findOne({ _id: id, userId: ctx.userId }).lean();
      if (!log) throw new NotFoundError("Media log entry");
      await MediaService.deleteLog(id, ctx.userId);
      return { deleted: id, title: log.title, type: TYPE_LABEL[log.type] };
    }),
  );
};

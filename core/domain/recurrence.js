const getNextResetTime = (lastCompletedAt, type) => {
  if (!lastCompletedAt) return new Date(0);

  const date = new Date(lastCompletedAt);

  if (type === "daily") {
    date.setDate(date.getDate() + 1);
  } else if (type === "weekly") {
    const dayOfWeek = date.getDay();
    let daysUntilNextMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7;
    if (daysUntilNextMonday === 0) daysUntilNextMonday = 7;
    date.setDate(date.getDate() + daysUntilNextMonday);
  } else if (type === "monthly") {
    date.setMonth(date.getMonth() + 1);
    date.setDate(1);
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

module.exports = {
  getNextResetTime,
};


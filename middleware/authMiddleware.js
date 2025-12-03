const { ClerkExpressRequireAuth } = require("@clerk/clerk-sdk-node");

// This function checks if the request has a valid session token.
// If yes: It adds 'req.auth' object (containing userId) and moves to the next step.
// If no: It sends a 401 Unauthorized error automatically.
const requireAuth = ClerkExpressRequireAuth({});

module.exports = requireAuth;

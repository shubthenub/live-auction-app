module.exports = {
    generateBid
};

// Start a global bid amount higher than your base price
let globalBid = 5000;

function generateBid(context, events, done) {
    // Increment by a random small amount so bids keep going up
    globalBid += Math.floor(Math.random() * 10) + 100;
    context.vars.dynamicBid = globalBid;
    return done();
}

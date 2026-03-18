'use strict';

let globalBid = 5000;

function beforeScenario(context, events, done) {
    // this runs before connection is made
    // set the auth token that socketio-v3 will use in handshake
    context.vars['$sioAuthToken'] = context.vars.token;
    return done();
}

function generateBid(context, events, done) {
    globalBid += Math.floor(Math.random() * 5) + 10;
    context.vars.dynamicBid = globalBid;
    return done();
}

function placeBidWithLatency(context, events, done) {
    let settled = false;

    const socketKeys = Object.keys(context.sockets || {});
    if (!socketKeys.length) {
        events.emit('counter', 'bid.error.no_socket', 1);
        return done();
    }

    const socket = context.sockets[socketKeys[0]];

    if (!socket || !socket.connected) {
        events.emit('counter', 'bid.error.disconnected', 1);
        return done();
    }

    const start = Date.now();

    socket.emit(
        'placeBid',
        {
            auctionId: context.vars.auctionId,
            amount: context.vars.dynamicBid,
        },
        (response) => {
            if (settled) return;
            settled = true;

            const latency = Date.now() - start;
            events.emit('histogram', 'bid.response_time', latency);

            if (response && response.success) {
                events.emit('counter', 'bid.success', 1);
            } else {
                events.emit('counter', 'bid.rejected', 1);
            }

            return done();
        }
    );

    setTimeout(() => {
        if (settled) return;
        settled = true;
        events.emit('counter', 'bid.timeout', 1);
        return done();
    }, 5000);
}

module.exports = { beforeScenario, generateBid, placeBidWithLatency };
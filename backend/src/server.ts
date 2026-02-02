import { app } from "./app.js";
import { connectMongo } from "./config/mongo.js";
import { env } from "./config/env.js";
import http from "http";
import { setupSocket } from "./ws/socket.js";
import { rabbitmq } from "./config/rabbitmq.js";
import { startBidConsumer } from "./bidding/bid.consumer.js";

await connectMongo();
await rabbitmq.connect();
await startBidConsumer();


const server = http.createServer(app);
const io = setupSocket(server);

server.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT}`);
});

export { io };

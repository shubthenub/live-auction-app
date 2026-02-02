import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTdkMmNiZjkzYzM3M2Y5ZjVmY2Q2MDgiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2OTk0MzczMywiZXhwIjoxNzY5OTUyNzMzLCJhdWQiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAifQ.ThfkH6HlaSZe_lWbL4wh7QtnhfNmCnQ7JbAxi3D6Xy4',
  },
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);

  // simulate user on auction page
  socket.emit('joinAuction', {
    auctionId: '697f37cf77e8cec31297e5b8',
  });

  setTimeout(() => {
    socket.emit("placeBid", { auctionId: "697f37cf77e8cec31297e5b8", amount: 92000 });
  }, 2000);
});

socket.on('joinedAuction', (data) => {
  console.log('Joined auction:', data);
});

socket.on('auctionStarted', (auctionId) => {
  console.log('Auction started:', auctionId);
  socket.emit('joinAuction',  auctionId );
});


socket.on('bidUpdate', (data) => {
  console.log('[CLIENT] bidUpdate received', {
    price: data.currentPrice,
    bidder: data.highestBidderId,
    endsAt: new Date(data.roundEndsAt).toISOString(),
  });
});

socket.on('auctionEnded', (data) => {
  console.log('Auction ended:', data);
});

socket.on('auctionError', (err) => {
  console.log('Error:', err);
});
socket.on('userError', (err) => {
  console.log('Error:', err);
});
socket.on('walletError', (err) => {
  console.log('Error:', err);
});
socket.on('redisError', (err) => {
  console.log('Error:', err);
});

socket.on('bidError', (err) => {
  console.log('Bid error:', err);
});

socket.on('joinError', (err) => {
  console.log('Join error:', err);
});


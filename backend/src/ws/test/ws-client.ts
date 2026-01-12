import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTYyMmY2MGQ2YzFlZDM4M2QxMDAzZGIiLCJyb2xlIjoiQVVDVElPTkVFUiIsImlhdCI6MTc2ODIxNDI3OCwiZXhwIjoxNzY4MjIzMjc4LCJhdWQiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAifQ.EicajzoWZ_6LbUsKLWm6dCHJyK86O3fGNii1a5IDjVk',
  },
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);

  // simulate user on auction page
  socket.emit('joinAuction', {
    auctionId: '696235a74c92c0f2c8d497ac',
  });
});

socket.on('joinedAuction', (data) => {
  console.log('Joined auction:', data);
});

socket.on('auctionStarted', (auctionId) => {
  console.log('Auction started:', auctionId);
  socket.emit('joinAuction', { auctionId });
});

socket.on('auctionEnded', (data) => {
  console.log('Auction ended:', data);
});

socket.on('error', (err) => {
  console.log('Error:', err);
});

import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTY4NmVkNjhkMWI2YmEwZTMzMDVjODIiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2OTQzMTY1OCwiZXhwIjoxNzY5NDQwNjU4LCJhdWQiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAifQ.RuVxJ1lH_EkSDLB4n_oJJsxJJsExqyuJqt_6iFJ-P7k',
  },
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);

  // simulate user on auction page
  socket.emit('joinAuction', {
    auctionId: '6977693127b752cafc57f622',
  });

  setTimeout(() => {
    socket.emit("placeBid", { auctionId: "6977693127b752cafc57f622", amount: 9100 });
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

socket.on('error', (err) => {
  console.log('Error:', err);
});

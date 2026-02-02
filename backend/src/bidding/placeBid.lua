local dataKey = KEYS[1]      -- "auction:data:123"
local timerKey = KEYS[2]     -- "auction:timer:123"
local walletKey = KEYS[3]    -- "wallet:userId" (current bidder)

local bid = tonumber(ARGV[1])
local bidderId = ARGV[2]
local now = tonumber(ARGV[3])
local minIncrement = tonumber(ARGV[4])
local roundDuration = tonumber(ARGV[5])

-- 1. Check if auction data exists
local currentPrice = tonumber(redis.call("HGET", dataKey, "currentPrice"))
if not currentPrice then
  return {0, "Auction not found or expired", 0}
end

-- 2. Validate bid amount first
if bid <= currentPrice then
  return {0, "Bid must be higher than current price", 0}
end

if bid < (currentPrice + minIncrement) then
  return {0, "Bid increment too small", 0}
end

-- 3. Validate wallet and available balance
local wallet = redis.call('HGETALL', walletKey)
if #wallet == 0 then
  return {0, "Wallet not found", 0}
end

local walletData = {}
for i = 1, #wallet, 2 do
  walletData[wallet[i]] = wallet[i + 1]
end

local balance = tonumber(walletData.balance) or 0
local locked = tonumber(walletData.locked) or 0

-- Check if available balance >= new bid amount
local available = balance - locked
if available < bid then
  return {0, "Insufficient available balance", 0}
end

-- 4. Release previous bidder's locked amount (if not same user)
local previousBidderId = redis.call("HGET", dataKey, "highestBidderId")
if previousBidderId and previousBidderId ~= "" and previousBidderId ~= bidderId then
  local prevWalletKey = "wallet:" .. previousBidderId
  local prevWallet = redis.call('HGETALL', prevWalletKey)
  
  if #prevWallet > 0 then
    local prevWalletData = {}
    for i = 1, #prevWallet, 2 do
      prevWalletData[prevWallet[i]] = prevWallet[i + 1]
    end
    
    local prevBalance = tonumber(prevWalletData.balance) or 0
    local prevLocked = tonumber(prevWalletData.locked) or 0
    
    -- Release locked amount for previous bidder
    redis.call('HSET', prevWalletKey,
      'balance', tostring(prevBalance),
      'locked', '0'
    )
    
    -- Extend previous bidder's wallet TTL
    redis.call('EXPIRE', prevWalletKey, 3600)
  end
end

-- 5. Update Auction Data
redis.call("HSET", dataKey,
  "currentPrice", tostring(bid),
  "highestBidderId", bidderId,
  "hasFirstBid", "1",
  "roundEndsAt", tostring(now + roundDuration)
)

-- 6. Update Current Bidder's Wallet - lock new bid amount
redis.call('HSET', walletKey,
  'balance', tostring(balance),
  'locked', tostring(bid)
)

-- 7. Extend wallet TTL
redis.call('EXPIRE', walletKey, 3600)

-- 8. Reset the Timer
redis.call("SET", timerKey, "active", "PX", roundDuration)

-- Return [currentPrice, highestBidderId, roundEndsAt]
local newRoundEnd = now + roundDuration
return {bid, bidderId, newRoundEnd}
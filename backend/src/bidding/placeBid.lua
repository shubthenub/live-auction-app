local dataKey   = KEYS[1]
local timerKey  = KEYS[2]
local walletKey = KEYS[3]

local bid           = tonumber(ARGV[1])
local bidderId      = ARGV[2]
local now           = tonumber(ARGV[3])
local minIncrement  = tonumber(ARGV[4])
local roundDuration = tonumber(ARGV[5])

-- 1. Check auction exists and is active
local currentPrice = tonumber(redis.call("HGET", dataKey, "currentPrice"))
if not currentPrice then
  return {0, "Auction not found or expired", 0}
end

local status = redis.call("HGET", dataKey, "status")
if status ~= "LIVE" then
  return {0, "Auction has ended", 0}
end

-- 2. Validate bid amount
if bid <= currentPrice then
  return {0, "Bid must be higher than current price", 0}
end
if bid < (currentPrice + minIncrement) then
  return {0, "Bid increment too small", 0}
end

-- 3. Validate wallet
local balance = tonumber(redis.call('HGET', walletKey, 'balance')) or 0
local locked  = tonumber(redis.call('HGET', walletKey, 'locked')) or 0

if balance == 0 then
  return {0, "Wallet not found", 0}
end

-- 4. Check available balance
local previousBidderId = redis.call("HGET", dataKey, "highestBidderId")
local available
if previousBidderId == bidderId then
  available = balance        -- rebid: locked amount gets replaced
else
  available = balance - locked
end

if available < bid then
  return {0, "Insufficient available balance", 0}
end

-- 5. Release previous bidder's lock
if previousBidderId and previousBidderId ~= "" and previousBidderId ~= bidderId then
  local prevWalletKey = "wallet:" .. previousBidderId
  local prevLocked = tonumber(redis.call('HGET', prevWalletKey, 'locked')) or 0
  if prevLocked > 0 then
    redis.call('HINCRBY', prevWalletKey, 'balance', prevLocked)
    redis.call('HSET', prevWalletKey, 'locked', '0')
    redis.call('EXPIRE', prevWalletKey, 3600)
  end
end

-- 6. Update auction data
local newRoundEnd = now + roundDuration
redis.call("HSET", dataKey,
  "currentPrice",   tostring(bid),
  "highestBidderId", bidderId,
  "hasFirstBid",    "1",
  "roundEndsAt",    tostring(newRoundEnd)
)

-- 7. Lock new bid amount for current bidder
redis.call('HSET', walletKey,
  'locked', tostring(bid)
)
redis.call('EXPIRE', walletKey, 3600)

-- 8. Reset timer
redis.call("SET", timerKey, "active", "PX", roundDuration)

return {bid, bidderId, newRoundEnd}
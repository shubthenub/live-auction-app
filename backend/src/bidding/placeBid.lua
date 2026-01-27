local dataKey = KEYS[1]      --"auction:data:123"
local timerKey = KEYS[2]     -- "auction:timer:123"
local bid = tonumber(ARGV[1])
local bidderId = ARGV[2]
local now = tonumber(ARGV[3])
local minIncrement = tonumber(ARGV[4])
local roundDuration = tonumber(ARGV[5])

-- 1. Check if auction data exists
local currentPrice = tonumber(redis.call("HGET", dataKey, "currentPrice"))
if not currentPrice then
    return {err = "Auction not found or expired"}
end

-- 2. Validate Bid Amount
if bid < (currentPrice + minIncrement) then
    return {err = "Bid too low"}
end

-- 3. Update Auction Data
redis.call("HSET", dataKey,
    "currentPrice", tostring(bid),
    "highestBidderId", bidderId,
    "hasFirstBid", "1",
    "roundEndsAt", tostring(now + roundDuration)
)

-- 4. Reset the Timer 
redis.call("SET", timerKey, "active", "PX", roundDuration)

-- Return the new state
local newRoundEnd = now + roundDuration
return { bid, bidderId, newRoundEnd }
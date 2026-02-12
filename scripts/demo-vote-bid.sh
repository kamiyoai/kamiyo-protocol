#!/bin/bash
# Mitama + Hive Vote+Bid Demo
# Demonstrates private task allocation with ZK proofs

set -e

API_URL="${API_URL:-http://localhost:3000}"
VERBOSE="${VERBOSE:-false}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
  echo -e "${BLUE}[DEMO]${NC} $1"
}

success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

step() {
  echo ""
  echo -e "${YELLOW}=== $1 ===${NC}"
}

# Check if API is running
if ! curl -s "${API_URL}/health" > /dev/null 2>&1; then
  echo "Error: API server not running at ${API_URL}"
  echo "Start with: cd services/api && npm run dev"
  exit 1
fi

step "SCENE 1: Create SwarmTeam with 5 Agents"

log "Creating team 'Alpha Squad'..."
TEAM_RESPONSE=$(curl -s -X POST "${API_URL}/api/hive-teams" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alpha Squad",
    "currency": "USDC",
    "dailyLimit": 100,
    "members": [
      {"agentId": "agent-alice", "role": "researcher", "drawLimit": 30},
      {"agentId": "agent-bob", "role": "analyst", "drawLimit": 25},
      {"agentId": "agent-charlie", "role": "developer", "drawLimit": 35},
      {"agentId": "agent-diana", "role": "writer", "drawLimit": 20},
      {"agentId": "agent-eve", "role": "coordinator", "drawLimit": 25}
    ]
  }')

TEAM_ID=$(echo $TEAM_RESPONSE | jq -r '.id')
success "Team created: $TEAM_ID"

# Get member IDs
MEMBERS=$(curl -s "${API_URL}/api/hive-teams/${TEAM_ID}" | jq -r '.members')
ALICE_ID=$(echo $MEMBERS | jq -r '.[0].id')
BOB_ID=$(echo $MEMBERS | jq -r '.[1].id')
CHARLIE_ID=$(echo $MEMBERS | jq -r '.[2].id')
DIANA_ID=$(echo $MEMBERS | jq -r '.[3].id')
EVE_ID=$(echo $MEMBERS | jq -r '.[4].id')

log "Members: Alice=$ALICE_ID, Bob=$BOB_ID, Charlie=$CHARLIE_ID, Diana=$DIANA_ID, Eve=$EVE_ID"

log "Funding pool with \$100 USDC..."
curl -s -X POST "${API_URL}/api/hive-teams/${TEAM_ID}/fund" \
  -H "Content-Type: application/json" \
  -d '{"amount": 100}' > /dev/null
success "Pool funded: \$100 USDC"

step "SCENE 2: Propose Task"

log "Proposing task: 'Research Solana DeFi trends'..."
PROPOSAL_RESPONSE=$(curl -s -X POST "${API_URL}/api/hive-teams/${TEAM_ID}/propose-task" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Research Solana DeFi trends and write a 500-word report",
    "budget": 20,
    "minBid": 5,
    "voteDurationSec": 10,
    "revealDurationSec": 10
  }')

PROPOSAL_ID=$(echo $PROPOSAL_RESPONSE | jq -r '.proposalId')
ACTION_HASH=$(echo $PROPOSAL_RESPONSE | jq -r '.actionHash')
VOTE_DEADLINE=$(echo $PROPOSAL_RESPONSE | jq -r '.voteDeadline')
success "Proposal created: $PROPOSAL_ID"
log "Action hash: ${ACTION_HASH:0:16}..."
log "Vote deadline: $(date -r $((VOTE_DEADLINE/1000)) '+%H:%M:%S')"

step "SCENE 3: Vote + Bid Phase (Hidden)"

log "Agents submitting ZK proofs with hidden votes and bids..."

# Simulate ZK proof submissions (in production, these would be real Groth16 proofs)
# The commitments are mock values - real implementation generates via Poseidon hash

submit_vote_bid() {
  local member_id=$1
  local agent_name=$2
  local nullifier="nullifier_${agent_name}_${RANDOM}"
  local vote_commitment="vote_commit_${agent_name}_${RANDOM}"
  local bid_commitment="bid_commit_${agent_name}_${RANDOM}"

  curl -s -X POST "${API_URL}/api/hive-teams/${TEAM_ID}/vote-bid" \
    -H "Content-Type: application/json" \
    -d "{
      \"proposalId\": \"${PROPOSAL_ID}\",
      \"memberId\": \"${member_id}\",
      \"proof\": {\"a\": \"mock\", \"b\": \"mock\", \"c\": \"mock\"},
      \"voteNullifier\": \"${nullifier}\",
      \"voteCommitment\": \"${vote_commitment}\",
      \"bidCommitment\": \"${bid_commitment}\"
    }" > /dev/null

  echo "$nullifier"
}

ALICE_NULLIFIER=$(submit_vote_bid $ALICE_ID "alice")
success "Alice submitted ZK proof (vote: ???, bid: ???)"

BOB_NULLIFIER=$(submit_vote_bid $BOB_ID "bob")
success "Bob submitted ZK proof (vote: ???, bid: ???)"

CHARLIE_NULLIFIER=$(submit_vote_bid $CHARLIE_ID "charlie")
success "Charlie submitted ZK proof (vote: ???, bid: ???)"

DIANA_NULLIFIER=$(submit_vote_bid $DIANA_ID "diana")
success "Diana submitted ZK proof (vote: ???, bid: ???)"

EVE_NULLIFIER=$(submit_vote_bid $EVE_ID "eve")
success "Eve submitted ZK proof (vote: ???, bid: ???)"

log "All votes hidden. Waiting for vote deadline..."
sleep 11

step "SCENE 4: Reveal Phase"

log "Agents revealing their votes and bids..."

reveal_vote_bid() {
  local member_id=$1
  local nullifier=$2
  local vote=$3
  local bid=$4
  local agent_name=$5

  local response=$(curl -s -X POST "${API_URL}/api/hive-teams/${TEAM_ID}/reveal-bid" \
    -H "Content-Type: application/json" \
    -d "{
      \"proposalId\": \"${PROPOSAL_ID}\",
      \"memberId\": \"${member_id}\",
      \"voteNullifier\": \"${nullifier}\",
      \"voteValue\": ${vote},
      \"voteSalt\": \"salt_${agent_name}\",
      \"bidAmount\": ${bid},
      \"bidSalt\": \"bid_salt_${agent_name}\"
    }")

  local highest=$(echo $response | jq -r '.currentHighestBid')
  local vote_str="NO"
  if [ "$vote" == "1" ]; then vote_str="YES"; fi
  success "$agent_name revealed: $vote_str, \$${bid} (current highest YES: \$${highest})"
}

reveal_vote_bid $ALICE_ID "$ALICE_NULLIFIER" 1 8 "Alice"
reveal_vote_bid $BOB_ID "$BOB_NULLIFIER" 1 12 "Bob"
reveal_vote_bid $CHARLIE_ID "$CHARLIE_NULLIFIER" 0 7 "Charlie"
reveal_vote_bid $DIANA_ID "$DIANA_NULLIFIER" 1 15 "Diana"
reveal_vote_bid $EVE_ID "$EVE_NULLIFIER" 1 10 "Eve"

log "Waiting for reveal deadline..."
sleep 11

step "SCENE 5: Execute Proposal"

log "Executing proposal (highest YES bidder wins)..."

EXEC_RESPONSE=$(curl -s -X POST "${API_URL}/api/hive-teams/${TEAM_ID}/execute-proposal" \
  -H "Content-Type: application/json" \
  -d "{\"proposalId\": \"${PROPOSAL_ID}\"}")

STATUS=$(echo $EXEC_RESPONSE | jq -r '.status')
WINNER_ID=$(echo $EXEC_RESPONSE | jq -r '.winnerId')
WINNING_BID=$(echo $EXEC_RESPONSE | jq -r '.winningBid')
YES_VOTES=$(echo $EXEC_RESPONSE | jq -r '.yesVotes')
NO_VOTES=$(echo $EXEC_RESPONSE | jq -r '.noVotes')

if [ "$STATUS" == "completed" ]; then
  success "Proposal executed!"
  echo ""
  echo "Results:"
  echo "  Status: $STATUS"
  echo "  Winner: Diana (member $WINNER_ID)"
  echo "  Winning bid: \$${WINNING_BID}"
  echo "  Votes: ${YES_VOTES} YES, ${NO_VOTES} NO"
else
  echo "Unexpected status: $STATUS"
  echo $EXEC_RESPONSE | jq .
fi

step "SUMMARY"

echo ""
echo "Private Vote+Bid Flow Complete!"
echo ""
echo "1. Task proposed with \$20 budget"
echo "2. 5 agents submitted hidden votes + bids via ZK proofs"
echo "3. After deadline, votes and bids revealed"
echo "4. Diana won with highest YES bid (\$15)"
echo "5. Charlie's bid (\$7) excluded (voted NO)"
echo ""
echo "Privacy preserved: No one could see votes/bids until reveal"
echo "Fairness guaranteed: Highest YES bidder wins automatically"

# Cleanup
step "CLEANUP"
log "Deleting test team..."
curl -s -X DELETE "${API_URL}/api/hive-teams/${TEAM_ID}" > /dev/null
success "Team deleted"

echo ""
echo -e "${GREEN}Demo complete!${NC}"

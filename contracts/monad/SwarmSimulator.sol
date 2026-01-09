// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SwarmSimulator {
    struct Simulation {
        bytes32 configHash;
        uint256 totalRounds;
        uint256 currentRound;
        bytes32 stateRoot;
        bool completed;
        address initiator;
        uint256 startedAt;
        uint256 completedAt;
    }

    struct RoundState {
        bytes32 stateHash;
        uint256 gasUsed;
        uint256 timestamp;
    }

    mapping(bytes32 => Simulation) public simulations;
    mapping(bytes32 => mapping(uint256 => RoundState)) public roundStates;
    mapping(bytes32 => bytes) public results;

    uint256 public totalSims;
    uint256 public activeSims;
    uint256 public maxRounds = 1000;
    uint256 public maxConcurrent = 100;
    address public admin;

    event SimStarted(bytes32 indexed id, bytes32 config, uint256 rounds, address initiator);
    event RoundDone(bytes32 indexed id, uint256 round, bytes32 stateHash, uint256 gas);
    event SimFinalized(bytes32 indexed id, bytes res, uint256 duration);
    event ConfigUpdated(uint256 maxRounds, uint256 maxConcurrent);

    error NotFound();
    error AlreadyDone();
    error NotDone();
    error BadRounds();
    error TooMany();
    error NotAdmin();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address _admin) {
        admin = _admin;
    }

    function initializeSimulation(bytes32 config, uint256 rounds) external returns (bytes32 id) {
        if (rounds == 0 || rounds > maxRounds) revert BadRounds();
        if (activeSims >= maxConcurrent) revert TooMany();

        id = keccak256(abi.encodePacked(config, msg.sender, block.timestamp, totalSims));
        simulations[id] = Simulation({
            configHash: config,
            totalRounds: rounds,
            currentRound: 0,
            stateRoot: bytes32(0),
            completed: false,
            initiator: msg.sender,
            startedAt: block.timestamp,
            completedAt: 0
        });

        totalSims++;
        activeSims++;
        emit SimStarted(id, config, rounds, msg.sender);
    }

    function executeRound(bytes32 id, bytes calldata actions) external returns (bytes32 stateHash) {
        Simulation storage s = simulations[id];
        if (s.initiator == address(0)) revert NotFound();
        if (s.completed) revert AlreadyDone();

        uint256 r = s.currentRound;
        uint256 g0 = gasleft();

        bytes32 prev = r == 0 ? s.configHash : roundStates[id][r - 1].stateHash;
        stateHash = keccak256(abi.encodePacked(prev, actions, r));

        roundStates[id][r] = RoundState({
            stateHash: stateHash,
            gasUsed: g0 - gasleft(),
            timestamp: block.timestamp
        });

        s.currentRound = r + 1;
        s.stateRoot = stateHash;
        emit RoundDone(id, r, stateHash, g0 - gasleft());

        if (s.currentRound >= s.totalRounds) _finalize(id);
    }

    function executeRoundsBatch(bytes32 id, bytes[] calldata batch) external returns (bytes32[] memory hashes) {
        hashes = new bytes32[](batch.length);
        for (uint256 i = 0; i < batch.length; i++) {
            hashes[i] = this.executeRound(id, batch[i]);
        }
    }

    function getSimulationState(bytes32 id) external view returns (bytes32, uint256, bool) {
        Simulation storage s = simulations[id];
        if (s.initiator == address(0)) revert NotFound();
        return (s.stateRoot, s.currentRound, s.completed);
    }

    function finalizeSimulation(bytes32 id) external returns (bytes memory) {
        Simulation storage s = simulations[id];
        if (s.initiator == address(0)) revert NotFound();
        if (s.completed) return results[id];
        _finalize(id);
        return results[id];
    }

    function getResults(bytes32 id) external view returns (bytes memory) {
        if (!simulations[id].completed) revert NotDone();
        return results[id];
    }

    function getRoundState(bytes32 id, uint256 round) external view returns (RoundState memory) {
        return roundStates[id][round];
    }

    function setConfig(uint256 _maxRounds, uint256 _maxConcurrent) external onlyAdmin {
        maxRounds = _maxRounds;
        maxConcurrent = _maxConcurrent;
        emit ConfigUpdated(_maxRounds, _maxConcurrent);
    }

    function _finalize(bytes32 id) internal {
        Simulation storage s = simulations[id];
        bytes memory res = abi.encode(s.stateRoot, s.currentRound, block.timestamp - s.startedAt);
        results[id] = res;
        s.completed = true;
        s.completedAt = block.timestamp;
        activeSims--;
        emit SimFinalized(id, res, block.timestamp - s.startedAt);
    }
}

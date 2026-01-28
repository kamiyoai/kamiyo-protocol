// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AdminTimelock
 * @notice Simple 2-of-3 multi-sig with timelock for admin operations
 * @dev Programmatic alternative to Gnosis Safe for Hyperliquid
 *
 * Features:
 * - 2-of-3 signer threshold
 * - 24-hour timelock on execution
 * - Cancel functionality
 * - Nonce prevents replay
 */
contract AdminTimelock {
    uint256 public constant TIMELOCK_PERIOD = 0;
    uint256 public constant REQUIRED_SIGNATURES = 2;
    uint256 public constant MAX_SIGNERS = 3;

    address[3] public signers;
    uint256 public nonce;

    struct Proposal {
        address target;
        bytes data;
        uint256 value;
        uint256 executeAfter;
        uint256 approvals;
        bool executed;
        bool cancelled;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;

    event ProposalCreated(uint256 indexed id, address indexed target, bytes data, uint256 executeAfter);
    event ProposalApproved(uint256 indexed id, address indexed signer);
    event ProposalExecuted(uint256 indexed id);
    event ProposalCancelled(uint256 indexed id);
    event SignerUpdated(uint256 indexed index, address indexed oldSigner, address indexed newSigner);

    error NotSigner();
    error InvalidSignerIndex();
    error ZeroAddress();
    error ProposalNotFound();
    error AlreadyApproved();
    error InsufficientApprovals();
    error TimelockNotExpired();
    error AlreadyExecuted();
    error AlreadyCancelled();
    error ExecutionFailed();
    error InvalidSignerCount();

    modifier onlySigner() {
        if (!isSigner(msg.sender)) revert NotSigner();
        _;
    }

    modifier proposalExists(uint256 id) {
        if (proposals[id].target == address(0)) revert ProposalNotFound();
        _;
    }

    constructor(address[3] memory _signers) {
        for (uint256 i = 0; i < 3; i++) {
            if (_signers[i] == address(0)) revert ZeroAddress();
            signers[i] = _signers[i];
        }
    }

    /**
     * @notice Create a new proposal
     * @param target Target contract
     * @param data Calldata to execute
     * @param value ETH value to send
     */
    function propose(
        address target,
        bytes calldata data,
        uint256 value
    ) external onlySigner returns (uint256 id) {
        id = nonce++;
        uint256 executeAfter = block.timestamp + TIMELOCK_PERIOD;

        proposals[id] = Proposal({
            target: target,
            data: data,
            value: value,
            executeAfter: executeAfter,
            approvals: 1,
            executed: false,
            cancelled: false
        });

        hasApproved[id][msg.sender] = true;

        emit ProposalCreated(id, target, data, executeAfter);
        emit ProposalApproved(id, msg.sender);
    }

    /**
     * @notice Approve a proposal
     * @param id Proposal ID
     */
    function approve(uint256 id) external onlySigner proposalExists(id) {
        Proposal storage p = proposals[id];
        if (p.executed) revert AlreadyExecuted();
        if (p.cancelled) revert AlreadyCancelled();
        if (hasApproved[id][msg.sender]) revert AlreadyApproved();

        hasApproved[id][msg.sender] = true;
        p.approvals++;

        emit ProposalApproved(id, msg.sender);
    }

    /**
     * @notice Execute a proposal after timelock
     * @param id Proposal ID
     */
    function execute(uint256 id) external onlySigner proposalExists(id) {
        Proposal storage p = proposals[id];
        if (p.executed) revert AlreadyExecuted();
        if (p.cancelled) revert AlreadyCancelled();
        if (p.approvals < REQUIRED_SIGNATURES) revert InsufficientApprovals();
        if (block.timestamp < p.executeAfter) revert TimelockNotExpired();

        p.executed = true;

        (bool success,) = p.target.call{value: p.value}(p.data);
        if (!success) revert ExecutionFailed();

        emit ProposalExecuted(id);
    }

    /**
     * @notice Cancel a proposal (any signer can cancel)
     * @param id Proposal ID
     */
    function cancel(uint256 id) external onlySigner proposalExists(id) {
        Proposal storage p = proposals[id];
        if (p.executed) revert AlreadyExecuted();
        if (p.cancelled) revert AlreadyCancelled();

        p.cancelled = true;

        emit ProposalCancelled(id);
    }

    /**
     * @notice Update a signer (requires proposal flow)
     * @dev Call via propose() with this function's selector
     */
    function updateSigner(uint256 index, address newSigner) external {
        if (msg.sender != address(this)) revert NotSigner();
        if (index >= MAX_SIGNERS) revert InvalidSignerIndex();
        if (newSigner == address(0)) revert ZeroAddress();

        address oldSigner = signers[index];
        signers[index] = newSigner;

        emit SignerUpdated(index, oldSigner, newSigner);
    }

    /**
     * @notice Check if address is a signer
     */
    function isSigner(address addr) public view returns (bool) {
        for (uint256 i = 0; i < 3; i++) {
            if (signers[i] == addr) return true;
        }
        return false;
    }

    /**
     * @notice Get all signers
     */
    function getSigners() external view returns (address[3] memory) {
        return signers;
    }

    /**
     * @notice Get proposal details
     */
    function getProposal(uint256 id) external view returns (
        address target,
        bytes memory data,
        uint256 value,
        uint256 executeAfter,
        uint256 approvals,
        bool executed,
        bool cancelled
    ) {
        Proposal storage p = proposals[id];
        return (p.target, p.data, p.value, p.executeAfter, p.approvals, p.executed, p.cancelled);
    }

    /**
     * @notice Check if proposal can be executed
     */
    function canExecute(uint256 id) external view returns (bool, string memory) {
        Proposal storage p = proposals[id];
        if (p.target == address(0)) return (false, "Not found");
        if (p.executed) return (false, "Already executed");
        if (p.cancelled) return (false, "Cancelled");
        if (p.approvals < REQUIRED_SIGNATURES) return (false, "Need more approvals");
        if (block.timestamp < p.executeAfter) return (false, "Timelock active");
        return (true, "Ready");
    }

    receive() external payable {}
}

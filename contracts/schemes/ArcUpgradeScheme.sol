pragma solidity ^0.5.16;

import "@daostack/infra-experimental/contracts/votingMachines/IntVoteInterface.sol";
import "@daostack/infra-experimental/contracts/votingMachines/VotingMachineCallbacksInterface.sol";
import "../votingMachines/VotingMachineCallbacks.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "@openzeppelin/upgrades/contracts/application/Package.sol";
import "@openzeppelin/upgrades/contracts/application/ImplementationProvider.sol";


/**
 * @title ArcUpgradeScheme.
 * @dev  A scheme for proposing updating the versions DAOs contracts
 */
contract ArcUpgradeScheme is VotingMachineCallbacks, ProposalExecuteInterface, Initializable {
    event NewUpgradeProposal(
        address indexed _avatar,
        bytes32 indexed _proposalId,
        uint64[3] _packageVersion,
        bytes32[] _contractsNames,
        address[] _contractsToUpgrade,
        string  _descriptionHash
    );

    event ProposalExecuted(
        address indexed _avatar,
        bytes32 indexed _proposalId
    );

    event ProposalExecutedByVotingMachine(
        address indexed _avatar,
        bytes32 indexed _proposalId,
        int256 _param
    );

    event ProposalDeleted(address indexed _avatar, bytes32 indexed _proposalId);

    // Details of a voting proposal:
    struct UpgradeProposal {
        uint64[3] packageVersion;
        bytes32[] contractsNames;
        address[] contractsToUpgrade;
        bool exist;
        bool passed;
    }

    mapping(bytes32=>UpgradeProposal) public organizationProposals;

    IntVoteInterface public votingMachine;
    bytes32 public voteParams;
    Avatar public avatar;
    Package public package;

    /**
     * @dev initialize
     * @param _avatar the avatar to mint reputation from
     * @param _votingMachine the voting machines address to
     * @param _voteParams voting machine parameters.
     */
    function initialize(
        Avatar _avatar,
        IntVoteInterface _votingMachine,
        bytes32 _voteParams,
        Package _package
    )
    external
    initializer
    {
        require(_avatar != Avatar(0), "avatar cannot be zero");
        avatar = _avatar;
        votingMachine = _votingMachine;
        voteParams = _voteParams;
        package = _package;
    }

    /**
    * @dev execution of proposals, can only be called by the voting machine in which the vote is held.
    * @param _proposalId the ID of the voting in the voting machine
    * @param _decision a parameter of the voting result, 1 yes and 2 is no.
    * @return bool success
    */
    function executeProposal(bytes32 _proposalId, int256 _decision)
    external
    onlyVotingMachine(_proposalId)
    returns(bool) {
        UpgradeProposal storage proposal = organizationProposals[_proposalId];
        require(proposal.exist, "must be a live proposal");
        require(proposal.passed == false, "cannot execute twice");

        if (_decision == 1) {
            proposal.passed = true;
            execute(_proposalId);
        } else {
            delete organizationProposals[_proposalId];
            emit ProposalDeleted(address(avatar), _proposalId);
        }

        emit ProposalExecutedByVotingMachine(address(avatar), _proposalId, _decision);
        return true;
    }

    /**
    * @dev execution of proposals after it has been decided by the voting machine
    * @param _proposalId the ID of the voting in the voting machine
    */
    function execute(bytes32 _proposalId) public {
        UpgradeProposal storage proposal = organizationProposals[_proposalId];
        require(proposal.exist, "must be a live proposal");
        require(proposal.passed, "proposal must passed by voting machine");
        proposal.exist = false;
        address[] memory contractsToUpgrade = proposal.contractsToUpgrade;
        for (uint256 i = 0; i < contractsToUpgrade.length; i++) {
            bytes32 contractNameBytes = proposal.contractsNames[i];
            string memory contractName = bytes32ToStr(contractNameBytes);
            address updatedImp = ImplementationProvider(
                package.getContract(proposal.packageVersion)
            ).getImplementation(contractName);

            Controller controller = Controller(avatar.owner());
            controller.genericCall(
                contractsToUpgrade[i],
                abi.encodeWithSignature("upgradeTo(address)", updatedImp),
                0
            );
        }

        delete organizationProposals[_proposalId];
        emit ProposalDeleted(address(avatar), _proposalId);
        emit ProposalExecuted(address(avatar), _proposalId);
    }

    /**
    * @dev propose upgrade contracts Arc version
    *      The function trigger NewUpgradeProposal event
    * @param _packageVersion - the new Arc version to use for the contracts
    * @param _contractsNames - names of contracts which needs to be upgraded
    * @param _contractsToUpgrade - addresses of contracts which needs to be upgraded
    * @param _descriptionHash - proposal description hash
    * @return an id which represents the proposal
    */
    function proposeUpgrade(
        uint64[3] memory _packageVersion,
        bytes32[] memory _contractsNames,
        address[] memory _contractsToUpgrade,
        string memory _descriptionHash)
    public
    returns(bytes32)
    {
        require(package.hasVersion(_packageVersion), "Specified version doesn't exist in the Package");
        for (uint256 i = 0; i < _contractsToUpgrade.length; i++) {
            require(
                ImplementationProvider(
                    package.getContract(_packageVersion)
                ).getImplementation(bytes32ToStr(_contractsNames[i])) != address(0),
                "Contract name does not exist in ArcHive package"
            );
        }

        bytes32 proposalId = votingMachine.propose(2, voteParams, msg.sender, address(avatar));

        organizationProposals[proposalId] = UpgradeProposal({
            packageVersion: _packageVersion,
            contractsNames: _contractsNames,
            contractsToUpgrade: _contractsToUpgrade,
            exist: true,
            passed: false
        });
        proposalsInfo[address(votingMachine)][proposalId] = ProposalInfo({
            blockNumber:block.number,
            avatar:avatar
        });
        emit NewUpgradeProposal(
            address(avatar),
            proposalId,
            _packageVersion,
            _contractsNames,
            _contractsToUpgrade,
            _descriptionHash
        );
        return proposalId;
    }

    function bytes32ToStr(bytes32 x) private pure returns (string memory) {
        bytes memory bytesString = new bytes(32);
        uint charCount = 0;
        uint j;
        for (j = 0; j < 32; j++) {
            byte char = byte(bytes32(uint(x) * 2 ** (8 * j)));
            if (char != 0) {
                bytesString[charCount] = char;
                charCount++;
            }
        }
        bytes memory bytesStringTrimmed = new bytes(charCount);
        for (j = 0; j < charCount; j++) {
            bytesStringTrimmed[j] = bytesString[j];
        }
        return string(bytesStringTrimmed);
    }
}

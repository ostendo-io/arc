import * as helpers from './helpers';
const constants = require('./constants');
const ContributionRewardExt = artifacts.require("./ContributionRewardExt.sol");
const ERC20Mock = artifacts.require('./test/ERC20Mock.sol');
const DaoCreator = artifacts.require("./DaoCreator.sol");
const ControllerCreator = artifacts.require("./ControllerCreator.sol");
const DAOTracker = artifacts.require("./DAOTracker.sol");
const Competition = artifacts.require("./Competition.sol");

export class ContributionRewardParams {
  constructor() {
  }
}

const setupContributionRewardParams = async function(
                                            contributionReward,
                                            accounts,
                                            genesisProtocol,
                                            token,
                                            avatar,
                                            redeemer = helpers.NULL_ADDRESS
                                            ) {
  var contributionRewardParams = new ContributionRewardParams();
  if (genesisProtocol === true) {
    contributionRewardParams.votingMachine = await helpers.setupGenesisProtocol(accounts,token,avatar,helpers.NULL_ADDRESS);
    await contributionReward.initialize(   avatar.address,
                                           contributionRewardParams.votingMachine.genesisProtocol.address,
                                           contributionRewardParams.votingMachine.params,
                                           redeemer);
    } else {
  contributionRewardParams.votingMachine = await helpers.setupAbsoluteVote(helpers.NULL_ADDRESS,50,contributionReward.address);
  await contributionReward.initialize(
                                         avatar.address,
                                         contributionRewardParams.votingMachine.absoluteVote.address,
                                         contributionRewardParams.votingMachine.params,
                                         redeemer
                                         );
  }
  return contributionRewardParams;
};

const setup = async function (accounts,genesisProtocol = false,tokenAddress=0,service=helpers.NULL_ADDRESS) {
   var testSetup = new helpers.TestSetup();
   testSetup.standardTokenMock = await ERC20Mock.new(accounts[1],100);
   testSetup.contributionRewardExt = await ContributionRewardExt.new();
   var controllerCreator = await ControllerCreator.new({gas: constants.ARC_GAS_LIMIT});
   var daoTracker = await DAOTracker.new({gas: constants.ARC_GAS_LIMIT});
   testSetup.daoCreator = await DaoCreator.new(controllerCreator.address,daoTracker.address,{gas:constants.ARC_GAS_LIMIT});
   if (genesisProtocol) {
      testSetup.reputationArray = [1000,100,0];
   } else {
      testSetup.reputationArray = [2000,5000,7000];
   }
   testSetup.org = await helpers.setupOrganizationWithArrays(testSetup.daoCreator,[accounts[0],accounts[1],accounts[2]],[1000,0,0],testSetup.reputationArray);
   testSetup.contributionRewardExtParams= await setupContributionRewardParams(
                      testSetup.contributionRewardExt,
                      accounts,genesisProtocol,
                      tokenAddress,
                      testSetup.org.avatar,
                      service);
   var permissions = "0x00000000";
   await testSetup.daoCreator.setSchemes(testSetup.org.avatar.address,
                                        [testSetup.contributionRewardExt.address],
                                        [helpers.NULL_HASH],[permissions],"metaData");

   testSetup.competition =  await Competition.new();
   return testSetup;
};

const proposeCompetition = async function(
                                          _testSetup,
                                          _descriptionHash = "description-hash",
                                          _reputationChange = 10,
                                          _rewards = [1,2,3],
                                          _rewardSplit = [50,25,15,10],
                                          _startTime = 0,
                                          _votingStartTime = 600,
                                          _endTime = 1200,
                                          _numberOfVotesPerVoters = 3,
                                          ) {

    var block = await web3.eth.getBlock("latest");
    _testSetup.startTime = block.timestamp + _startTime;
    _testSetup.votingStartTime = block.timestamp + _votingStartTime;
    _testSetup.endTime = block.timestamp + _endTime;
    var tx = await _testSetup.competition.proposeCompetition(
                                   _descriptionHash,
                                   _reputationChange,
                                   _rewards = [1,2,3],
                                   _testSetup.standardTokenMock.address,
                                   _rewardSplit,
                                   _testSetup.startTime,
                                   _testSetup.votingStartTime,
                                   _testSetup.endTime,
                                   _numberOfVotesPerVoters,
                                   _testSetup.contributionRewardExt.address
                                 );

    var proposalId = await helpers.getValueFromLogs(tx, '_proposalId',1);
    assert.equal(tx.logs.length, 1);
    assert.equal(tx.logs[0].event, "NewCompetitionProposal");
    assert.equal(tx.logs[0].args._proposalId,proposalId);
    assert.equal(tx.logs[0].args._numberOfWinners,_rewardSplit.length);
    assert.equal(tx.logs[0].args._rewardSplit[0],_rewardSplit[0]);
    assert.equal(tx.logs[0].args._rewardSplit[1],_rewardSplit[1]);
    assert.equal(tx.logs[0].args._rewardSplit[2],_rewardSplit[2]);
    assert.equal(tx.logs[0].args._rewardSplit[3],_rewardSplit[3]);
    assert.equal(tx.logs[0].args._startTime,_testSetup.startTime);
    assert.equal(tx.logs[0].args._votingStartTime,_testSetup.votingStartTime);
    assert.equal(tx.logs[0].args._endTime,_testSetup.endTime);
    assert.equal(tx.logs[0].args._numberOfVotesPerVoters,_numberOfVotesPerVoters);
    assert.equal(tx.logs[0].args._contributionReward,_testSetup.contributionRewardExt.address);

    return proposalId;
};


contract('Competition', accounts => {

    it("proposeCompetition log", async function() {
      var testSetup = await setup(accounts);
      await proposeCompetition(testSetup);

      var descriptionHash = "description-hash";
      var reputationChange = 10;
      var rewards = [1,2,3];
      var rewardSplit = new Array(101).fill(0);
      var startTime = 0;
      var votingStartTime = 600;
      var endTime = 1200;
      rewardSplit[0]= 100;
      try {

             await proposeCompetition(testSetup,
                                      descriptionHash,
                                      reputationChange,
                                      rewards,
                                      rewardSplit);
             assert(false, 'number of winners should be <= 100');
        } catch (ex) {
             helpers.assertVMException(ex);
       }
       rewardSplit = [50,25,15,0];
       try {

              await proposeCompetition(testSetup,
                                       descriptionHash,
                                       reputationChange,
                                       rewards,
                                       rewardSplit);
              assert(false, 'total reward split should be 100%');
         } catch (ex) {
              helpers.assertVMException(ex);
        }
        rewardSplit = [50,25,15,10];

        try {

               await proposeCompetition(testSetup,
                                        descriptionHash,
                                        reputationChange,
                                        rewards,
                                        rewardSplit,
                                        startTime,
                                        endTime);//votingStartTime
               assert(false, '_votingStartTime < _endTime');
          } catch (ex) {
               helpers.assertVMException(ex);
         }

         try {

                await proposeCompetition(testSetup,
                                         descriptionHash,
                                         reputationChange,
                                         rewards,
                                         rewardSplit,
                                         votingStartTime,//startTime
                                         votingStartTime-1);//votingStartTime
                assert(false, '_votingStartTime >= _startTime,');
           } catch (ex) {
                helpers.assertVMException(ex);
          }

          try {

                 await proposeCompetition(testSetup,
                                          descriptionHash,
                                          reputationChange,
                                          rewards,
                                          rewardSplit,
                                          startTime,//startTime
                                          votingStartTime,
                                          endTime,
                                          0);//votingStartTime
                 assert(false, 'numberOfVotesPerVoters > 0');
            } catch (ex) {
                 helpers.assertVMException(ex);
           }
     });

     it("suggest", async function() {
       var testSetup = await setup(accounts);
       var proposalId = await proposeCompetition(testSetup);
       var tx = await testSetup.competition.suggest(proposalId,"suggestion");
       assert.equal(tx.logs.length, 1);
       assert.equal(tx.logs[0].event, "NewSuggestion");
       assert.equal(tx.logs[0].args._suggestionId,1);
      });

    it("cannot suggest before start time", async function() {
      var testSetup = await setup(accounts);
      var descriptionHash = "description-hash";
      var reputationChange = 10;
      var rewards = [1,2,3];
      var rewardSplit = [0,50,25,25];
      var proposalId = await proposeCompetition(testSetup,
                                  descriptionHash,
                                  reputationChange,
                                  rewards,
                                  rewardSplit,
                                  10//startTime
                                 );//votingStartTime
      try {

             await testSetup.competition.suggest(proposalId,"suggestion");
             assert(false, 'cannot suggest before start time');
        } catch (ex) {
             helpers.assertVMException(ex);
       }
       await helpers.increaseTime(10+1);
       await testSetup.competition.suggest(proposalId,"suggestion");
     });

     it("cannot suggest after competition end", async function() {
       var testSetup = await setup(accounts);
       var proposalId = await proposeCompetition(testSetup);//votingStartTime
       await testSetup.competition.suggest(proposalId,"suggestion");
       await helpers.increaseTime(1200+1);
       try {
              await testSetup.competition.suggest(proposalId,"suggestion");
              assert(false, 'cannot suggest after competition end');
         } catch (ex) {
              helpers.assertVMException(ex);
        }
      });

  it("vote", async function() {
    var testSetup = await setup(accounts);
    var proposalId = await proposeCompetition(testSetup);
    var tx = await testSetup.competition.suggest(proposalId,"suggestion");
    var suggestionId = tx.logs[0].args._suggestionId;

    try {
           await testSetup.competition.vote(suggestionId);
           assert(false, 'vote before voting start time should fail');
      } catch (ex) {
           helpers.assertVMException(ex);
     }
     await helpers.increaseTime(650);

    try {
           await testSetup.competition.vote(suggestionId+1);
           assert(false, 'vote on none valid suggestion');
      } catch (ex) {
           helpers.assertVMException(ex);
     }
    var proposal =  await testSetup.competition.proposals(proposalId);
    tx = await testSetup.competition.vote(suggestionId);

    try {
           await testSetup.competition.vote(suggestionId);
           assert(false, 'can vote only one time on each suggestion');
      } catch (ex) {
           helpers.assertVMException(ex);
     }

    assert.equal(tx.logs.length, 2);
    assert.equal(tx.logs[0].event, "SnapshotBlock");
    assert.equal(tx.logs[0].args._proposalId,proposalId);
    assert.equal(tx.logs[0].args._snapshotBlock,tx.logs[0].blockNumber);

    assert.equal(tx.logs[1].event, "NewVote");
    assert.equal(tx.logs[1].args._suggestionId,1);
    assert.equal(tx.logs[1].args._reputation,testSetup.reputationArray[0]);

    //first vote set the snapshotBlock
    await testSetup.competition.suggest(proposalId,"suggestion");
    await testSetup.competition.vote(2);
    proposal =  await testSetup.competition.proposals(proposalId);
    assert.equal(proposal.snapshotBlock, tx.logs[0].blockNumber);

    //3rd suggestion
    await testSetup.competition.suggest(proposalId,"suggestion");
    //4th suggestion
    await testSetup.competition.suggest(proposalId,"suggestion");
    await testSetup.competition.vote(3);

    try {
           await testSetup.competition.vote(4);
           assert(false, 'cannot vote more than allowed per voter');
      } catch (ex) {
           helpers.assertVMException(ex);
     }

   });


   it("total votes", async function() {
     var testSetup = await setup(accounts);
     var proposalId = await proposeCompetition(testSetup);
     var tx = await testSetup.competition.suggest(proposalId,"suggestion");
     var suggestionId = tx.logs[0].args._suggestionId;
     await helpers.increaseTime(650);
     await testSetup.competition.vote(suggestionId);
     await testSetup.competition.vote(suggestionId,{from:accounts[1]});
     await testSetup.competition.vote(suggestionId,{from:accounts[2]});
     var suggestion =  await testSetup.competition.suggestions(suggestionId);
     assert.equal(suggestion.totalVotes, testSetup.reputationArray[0] +testSetup.reputationArray[1]+testSetup.reputationArray[2]);
   });

   it("getOrderedIndexOfSuggestion", async function() {
     var testSetup = await setup(accounts);
     var proposalId = await proposeCompetition(testSetup);
     for (var i=0;i<20;i++) {
         //submit 20 suggestion
        await testSetup.competition.suggest(proposalId,"suggestion");
     }
     await helpers.increaseTime(650);
     await testSetup.competition.vote(10,{from:accounts[0]});
     await testSetup.competition.vote(16,{from:accounts[2]});
     await testSetup.competition.vote(5,{from:accounts[1]});

     assert.equal(await testSetup.competition.getOrderedIndexOfSuggestion(proposalId,10),2);
     assert.equal(await testSetup.competition.getOrderedIndexOfSuggestion(proposalId,5),1);
     assert.equal(await testSetup.competition.getOrderedIndexOfSuggestion(proposalId,16),0);

   });

   it("getOrderedIndexOfSuggestion equality case", async function() {
     var testSetup = await setup(accounts);
     var proposalId = await proposeCompetition(testSetup);
     for (var i=0;i<20;i++) {
         //submit 20 suggestion
        await testSetup.competition.suggest(proposalId,"suggestion");
     }
     await helpers.increaseTime(650);
     await testSetup.competition.vote(10,{from:accounts[0]});
     await testSetup.competition.vote(16,{from:accounts[0]});
     await testSetup.competition.vote(5,{from:accounts[0]});

     assert.equal(await testSetup.competition.getOrderedIndexOfSuggestion(proposalId,10),0);

     assert.equal(await testSetup.competition.getOrderedIndexOfSuggestion(proposalId,16),0);

     assert.equal(await testSetup.competition.getOrderedIndexOfSuggestion(proposalId,5),0);

     assert.equal(await testSetup.competition.getOrderedIndexOfSuggestion(proposalId,0),3);

   });
});

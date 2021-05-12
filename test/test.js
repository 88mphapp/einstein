const { assert, artifacts, web3 } = require("hardhat");
const BigNumber = require("bignumber.js");

const ERC20Mock = artifacts.require("ERC20Mock");
const Einstein = artifacts.require("Einstein");

const multiplier = 1e9;
const unlockTime = 86400;
const PRECISION = 1e18;
const epsilon = 1e-4;

const epsilonEq = (curr, prev, ep) => {
  const _epsilon = ep || epsilon;
  return (
    BigNumber(curr).eq(prev) ||
    (!BigNumber(prev).isZero() &&
      BigNumber(curr)
        .minus(prev)
        .div(prev)
        .abs()
        .lt(_epsilon)) ||
    (!BigNumber(curr).isZero() &&
      BigNumber(prev)
        .minus(curr)
        .div(curr)
        .abs()
        .lt(_epsilon))
  );
};

const assertEpsilonEq = (a, b, message) => {
  assert(
    epsilonEq(a, b),
    `assertEpsilonEq error, a=${BigNumber(a).toString()}, b=${BigNumber(
      b
    ).toString()}, message=${message}`
  );
};

const num2str = x =>
  BigNumber(x)
    .integerValue()
    .toFixed();

const einToMPH = x => BigNumber(x).div(multiplier);
const mphToEIN = x => BigNumber(x).times(multiplier);

const latestBlockTimestamp = async () => {
  return (await web3.eth.getBlock("latest")).timestamp;
};

// travel `time` seconds forward in time
const timeTravel = time => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [time],
        id: new Date().getTime()
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

contract("basic tests", accounts => {
  let mph;
  let ein;
  const amount = 10 * PRECISION;
  const forceProduceBlock = () => mph.mint(accounts[1], 0);
  const timePass = async time => {
    await timeTravel(time);
    await forceProduceBlock();
  };

  beforeEach(async () => {
    mph = await ERC20Mock.new();
    ein = await Einstein.new(
      mph.address,
      num2str(multiplier),
      num2str(unlockTime)
    );

    // mint a bunch
    await mph.mint(accounts[0], num2str(1e3 * PRECISION));

    // woof
    await mph.approve(ein.address, num2str(amount));
    await ein.woof(num2str(amount));
  });

  it("minting should give locked tokens", async () => {
    const now = await latestBlockTimestamp();

    // balance should be 0
    const balance = BigNumber(await ein.balanceOf(accounts[0]));
    assert(balance.eq(0), "balance not 0 right after minting");

    // should have correct UnlockInfo struct
    const unlockInfo = await ein.accountUnlockInfo(accounts[0]);
    assert.equal(
      num2str(unlockInfo.startTime),
      num2str(now),
      "startTime wrong"
    );
    assert.equal(
      num2str(unlockInfo.endTime),
      num2str(now + unlockTime),
      "endTime wrong"
    );
    assert.equal(
      num2str(unlockInfo.amount),
      num2str(mphToEIN(amount)),
      "amount wrong"
    );
  });

  it("minting and waiting should give unlocked tokens", async () => {
    // wait 0.3 unlock time
    await timePass(unlockTime * 0.3);

    // balance should be 0.3 * minted amount
    const balance0 = BigNumber(await ein.balanceOf(accounts[0]));
    assertEpsilonEq(
      balance0,
      mphToEIN(amount).times(0.3),
      "balance wrong after waiting"
    );

    // wait 0.7 unlock time
    await timePass(unlockTime * 0.7);

    // balance should be minted amount
    const balance1 = BigNumber(await ein.balanceOf(accounts[0]));
    assertEpsilonEq(balance1, mphToEIN(amount), "balance wrong after waiting");

    // wait some more
    await timePass(unlockTime);

    // balance should be minted amount
    const balance2 = BigNumber(await ein.balanceOf(accounts[0]));
    assertEpsilonEq(balance2, mphToEIN(amount), "balance wrong after waiting");
  });

  it("burn should deduct balance an give MPH", async () => {
    // wait unlock time
    await timePass(unlockTime);

    // unwoof balance
    const balance0 = BigNumber(await ein.balanceOf(accounts[0]));
    const mphBalanceBefore = BigNumber(await mph.balanceOf(accounts[0]));
    await ein.unwoof(num2str(balance0));

    // balance should be 0
    const balance1 = BigNumber(await ein.balanceOf(accounts[0]));
    assertEpsilonEq(balance1, 0, "balance not 0 after burning");

    // mph increase should be correct
    const actualMPHReceived = BigNumber(await mph.balanceOf(accounts[0])).minus(
      mphBalanceBefore
    );
    const expectedMPHReceived = einToMPH(balance0);
    assertEpsilonEq(
      actualMPHReceived,
      expectedMPHReceived,
      "MPH received wrong"
    );
  });

  it("burn should deduct from unlocked balance and give MPH", async () => {
    // wait 0.3 unlock time
    await timePass(unlockTime * 0.3);

    // unwoof balance
    const balance0 = BigNumber(await ein.balanceOf(accounts[0]));
    const mphBalanceBefore = BigNumber(await mph.balanceOf(accounts[0]));
    await ein.unwoof(num2str(balance0));

    // balance should be 0 (plus amount unlocked in 1 second)
    const balance1 = BigNumber(await ein.balanceOf(accounts[0]));
    assertEpsilonEq(
      balance1,
      mphToEIN(amount / unlockTime),
      "balance not 0 after burning"
    );

    // mph increase should be correct
    const actualMPHReceived = BigNumber(await mph.balanceOf(accounts[0])).minus(
      mphBalanceBefore
    );
    const expectedMPHReceived = einToMPH(balance0);
    assertEpsilonEq(
      actualMPHReceived,
      expectedMPHReceived,
      "MPH received wrong"
    );
  });

  it("should be able to transfer unlocked balance", async () => {
    // wait 0.3 unlock time
    await timePass(unlockTime * 0.3);

    // transfer balance
    const balance0 = BigNumber(await ein.balanceOf(accounts[0]));
    await ein.transfer(accounts[1], num2str(balance0));

    // from account balance should be 0 (plus amount unlocked in 1 second)
    const balance1 = BigNumber(await ein.balanceOf(accounts[0]));
    assertEpsilonEq(
      balance1,
      mphToEIN(amount / unlockTime),
      "balance not 0 after sending"
    );

    // to account balance should be correct
    const balance2 = BigNumber(await ein.balanceOf(accounts[1]));
    assertEpsilonEq(balance2, balance0, "balance wrong after receiving");
  });
});

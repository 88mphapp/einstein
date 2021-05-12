const BigNumber = require("bignumber.js");
const config = require("../deploy-config/config.json");

module.exports = async ({
  web3,
  getNamedAccounts,
  deployments,
  getChainId,
  artifacts
}) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy("Einstein", {
    from: deployer,
    args: [
      config.mph,
      BigNumber(config.multiplier)
        .integerValue()
        .toFixed(),
      config.unlockTime
    ]
  });
  if (deployResult.newlyDeployed) {
    log(`Einstein deployed at ${deployResult.address}`);
  }
};
module.exports.tags = ["Einstein"];
module.exports.dependencies = [];

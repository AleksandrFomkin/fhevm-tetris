import { ethers } from "hardhat";

async function main() {
  const signers = await ethers.getSigners();
  const randomDeployer = signers[Math.floor(Math.random() * signers.length)];

  console.log(`Deploying FHETetris with account: ${randomDeployer.address}`);

  const FHETetris = await ethers.getContractFactory("FHETetris");
  const contract = await FHETetris.connect(randomDeployer).deploy();

  await contract.waitForDeployment();

  console.log(`✅ FHETetris deployed at: ${await contract.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

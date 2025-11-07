import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FHETetris, FHETetris__factory } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Players = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFHETetris() {
  const factory = (await ethers.getContractFactory("FHETetris")) as FHETetris__factory;
  const instance = (await factory.deploy()) as FHETetris;
  const address = await instance.getAddress();
  return { instance, address };
}

describe("🎮 FHETetris - Encrypted Gameplay Scoreboard", function () {
  let users: Players;
  let game: FHETetris;
  let gameAddr: string;

  before(async () => {
    const [deployer, alice, bob] = await ethers.getSigners();
    users = { deployer, alice, bob };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("⚠️ Requires FHEVM local mock for unit testing");
      this.skip();
    }
    ({ instance: game, address: gameAddr } = await deployFHETetris());
  });

  it("🧩 starts with no scores for a fresh player", async () => {
    const scores = await game.fetchScores(users.alice.address);
    expect(scores.length).to.eq(0);
  });

  it("🏁 allows a player to record and decrypt a single encrypted score", async () => {
    const encrypted = await fhevm.createEncryptedInput(gameAddr, users.alice.address).add32(1234).encrypt();

    const tx = await game.connect(users.alice).uploadScore(encrypted.handles[0], encrypted.inputProof);
    await tx.wait();

    const stored = await game.fetchScores(users.alice.address);
    expect(stored.length).to.eq(1);

    const plain = await fhevm.userDecryptEuint(FhevmType.euint32, stored[0], gameAddr, users.alice);
    expect(plain).to.eq(1234);
  });

  it("📊 supports recording multiple encrypted scores sequentially", async () => {
    const scoreSet = [500, 1200, 900];
    for (const s of scoreSet) {
      const encrypted = await fhevm.createEncryptedInput(gameAddr, users.alice.address).add32(s).encrypt();
      await (await game.connect(users.alice).uploadScore(encrypted.handles[0], encrypted.inputProof)).wait();
    }

    const all = await game.fetchScores(users.alice.address);
    expect(all.length).to.eq(scoreSet.length);

    for (let i = 0; i < all.length; i++) {
      const val = await fhevm.userDecryptEuint(FhevmType.euint32, all[i], gameAddr, users.alice);
      expect(val).to.eq(scoreSet[i]);
    }
  });

  it("🔐 isolates player data (no cross-access between users)", async () => {
    const encAlice = await fhevm.createEncryptedInput(gameAddr, users.alice.address).add32(800).encrypt();
    await game.connect(users.alice).uploadScore(encAlice.handles[0], encAlice.inputProof);

    const encBob = await fhevm.createEncryptedInput(gameAddr, users.bob.address).add32(300).encrypt();
    await game.connect(users.bob).uploadScore(encBob.handles[0], encBob.inputProof);

    const aliceData = await game.fetchScores(users.alice.address);
    const bobData = await game.fetchScores(users.bob.address);

    const aVal = await fhevm.userDecryptEuint(FhevmType.euint32, aliceData[0], gameAddr, users.alice);
    const bVal = await fhevm.userDecryptEuint(FhevmType.euint32, bobData[0], gameAddr, users.bob);

    expect(aVal).to.eq(800);
    expect(bVal).to.eq(300);
  });

  it("🌀 handles duplicate encrypted scores correctly", async () => {
    const repeated = [200, 200];
    for (const s of repeated) {
      const enc = await fhevm.createEncryptedInput(gameAddr, users.alice.address).add32(s).encrypt();
      await (await game.connect(users.alice).uploadScore(enc.handles[0], enc.inputProof)).wait();
    }

    const list = await game.fetchScores(users.alice.address);
    expect(list.length).to.eq(2);

    for (const encryptedScore of list) {
      const decrypted = await fhevm.userDecryptEuint(FhevmType.euint32, encryptedScore, gameAddr, users.alice);
      expect(decrypted).to.eq(200);
    }
  });

  it("⚡ accepts the maximum uint32 score", async () => {
    const maxScore = 2 ** 32 - 1;
    const encrypted = await fhevm.createEncryptedInput(gameAddr, users.alice.address).add32(maxScore).encrypt();
    await (await game.connect(users.alice).uploadScore(encrypted.handles[0], encrypted.inputProof)).wait();

    const stored = await game.fetchScores(users.alice.address);
    const decrypted = await fhevm.userDecryptEuint(FhevmType.euint32, stored[0], gameAddr, users.alice);
    expect(decrypted).to.eq(maxScore);
  });

  it("🧠 keeps order consistent when many scores are uploaded", async () => {
    const sequence = [100, 200, 300, 400];
    for (const s of sequence) {
      const enc = await fhevm.createEncryptedInput(gameAddr, users.alice.address).add32(s).encrypt();
      await (await game.connect(users.alice).uploadScore(enc.handles[0], enc.inputProof)).wait();
    }

    const all = await game.fetchScores(users.alice.address);
    const first = await fhevm.userDecryptEuint(FhevmType.euint32, all[0], gameAddr, users.alice);
    const last = await fhevm.userDecryptEuint(FhevmType.euint32, all[all.length - 1], gameAddr, users.alice);

    expect(first).to.eq(100);
    expect(last).to.eq(400);
  });

  it("🚀 allows fast consecutive score submissions", async () => {
    const quickScores = [10, 20, 30];
    for (const s of quickScores) {
      const enc = await fhevm.createEncryptedInput(gameAddr, users.alice.address).add32(s).encrypt();
      await game.connect(users.alice).uploadScore(enc.handles[0], enc.inputProof);
    }

    const stored = await game.fetchScores(users.alice.address);
    expect(stored.length).to.eq(quickScores.length);

    const lastScore = await fhevm.userDecryptEuint(FhevmType.euint32, stored[stored.length - 1], gameAddr, users.alice);
    expect(lastScore).to.eq(quickScores[quickScores.length - 1]);
  });
});

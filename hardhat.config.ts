import { defineConfig } from "hardhat/config";

export default defineConfig({
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  test: {
    solidity: {
      fuzz: {
        runs: 128,
      },
      invariant: {
        runs: 64,
        depth: 64,
        failOnRevert: false,
      },
    },
  },
});

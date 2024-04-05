import {
  EAS,
  SchemaEncoder,
  SchemaRegistry,
} from "@ethereum-attestation-service/eas-sdk";
import {
  easContractAddress,
  proposalSchemaUID,
  adminWallet,
  bundlerUrl,
  biconomyPaymasterKey,
  biconomyPrivateKey,
  easContractABI,
  rpcUrl,
  appwriteDB,
  proposalsCollection,
  generateID,
  databasesClient,
} from "./api";
import { ethers } from "ethers";
import { createSmartAccountClient } from "@biconomy/account";

export class ProposalService {
  // send proposal to appwrite
  static async makeProposal(
    title,
    summary,
    problem,
    solution,
    specifications,
    steps,
    collaborators,
    timeline,
    budget,
    location,
    milestones,
    proposalUID
  ) {
    const response = await databasesClient.createDocument(
      appwriteDB,
      proposalsCollection,
      generateID,
      {
        title,
        summary,
        problem,
        solution,
        specifications,
        steps,
        collaborators,
        timeline,
        budget,
        location,
        milestones,
        proposalUID,
      }
    );
    return response;
  }

  // fetch proposals from appwrite
  static async fetchProposals() {
    const response = await databasesClient.listDocuments(
      appwriteDB,
      proposalsCollection
    );
    return response;
  }

  // create a proposal on EAS
  static async createNewProposal(
    title,
    summary,
    problem,
    solution,
    specifications,
    steps,
    collaborators,
    timeline,
    budget,
    location,
    milestones,
    // creator,
    // wholePropsal,
    provider,
    signer
  ) {
    const config = {
      privateKey: biconomyPrivateKey,
      biconomyPaymasterApiKey: biconomyPaymasterKey,
      bundlerUrl: bundlerUrl,
      rpcUrl: rpcUrl,
    };

    // let provider = new ethers.JsonRpcProvider(rpcUrl);
    // let signer = new ethers.Wallet(config.privateKey, provider);

    const smartAccount = await createSmartAccountClient({
      signer: signer,
      chainId: 11155111,
      bundlerUrl: bundlerUrl,
      biconomyPaymasterApiKey: biconomyPaymasterKey,
      rpcUrl: rpcUrl,
    });

    const smartWallet = await createSmartAccountClient({
      signer,
      biconomyPaymasterApiKey: config.biconomyPaymasterApiKey,
      bundlerUrl: config.bundlerUrl,
    });

    const eas = new EAS(easContractAddress);
    await eas.connect(signer);

    const proposalSchemaEncoder = new SchemaEncoder(
      "string title,string summary,string problem,string solution,string specifications,string[] steps,string[] collaborators,string timeline,string budget,string location,string[] milestone"
    );

    const encodedData = proposalSchemaEncoder.encodeData([
      { name: "title", value: title, type: "string" },
      { name: "summary", value: summary, type: "string" },
      { name: "problem", value: problem, type: "string" },
      { name: "solution", value: solution, type: "string" },
      { name: "specifications", value: specifications, type: "string" },
      { name: "steps", value: steps, type: "string[]" },
      { name: "collaborators", value: collaborators, type: "string[]" },
      { name: "timeline", value: timeline, type: "string" },
      { name: "budget", value: budget, type: "string" },
      { name: "location", value: location, type: "string" },
      { name: "milestone", value: milestones, type: "string[]" },
    ]);

    // const transaction = await eas.attest({
    //   schema: proposalSchemaUID,
    //   data: {
    //     recipient: adminWallet,
    //     expirationTime: 0,
    //     revocable: true,
    //     data: encodedData,
    //   },
    // });

    // const receipt = await transaction.tx.getTransaction();
    // console.log("proposal UID:", receipt);
    // return receipt;

    const contractInstance = new ethers.Contract(
      easContractAddress,
      easContractABI,
      provider
    );

    const tx = await contractInstance.attest.populateTransaction({
      schema: proposalSchemaUID,
      data: {
        recipient: adminWallet,
        expirationTime: 0,
        revocable: false,
        data: encodedData,
        refUID:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        value: 0,
      },
    });

    const txObj = {
      to: easContractAddress,
      data: tx.data,
    };

    const userOpResponse = await smartWallet.sendTransaction(txObj, {
      paymasterServiceData: { mode: "SPONSORED" },
    });

    const { transactionHash } = await userOpResponse.waitForTxHash();

    const userOpReceipt = await userOpResponse.wait();

    let uid; // attestation UID

    if (userOpReceipt.success == "true") {
      uid = userOpReceipt.receipt.logs[1].data;

      console.log("uid:", uid);
    }

    return uid;
  }

  // get and decode proposal from EAS
  static async getProposals(provider) {
    const schemaRegistryContractAddress =
      "0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0"; // Sepolia 0.26
    const schemaRegistry = new SchemaRegistry(schemaRegistryContractAddress);
    schemaRegistry.connect(provider);

    const schemaUID = "schema uid here";

    const schemaRecord = await schemaRegistry.getSchema({ uid: schemaUID });

    console.log("schema record:", schemaRecord);

    return schemaRecord;

    // const encodedData = attestation.data;

    // const types = ["string", "string", "string", "uint64", "string", "string"];

    // const abiCoder = await ethers.AbiCoder.defaultAbiCoder();

    // // Decode the data
    // const decodedData = abiCoder.decode(types, encodedData);

    // console.log("decoded data:", decodedData);

    // return decodedData;
  }
}
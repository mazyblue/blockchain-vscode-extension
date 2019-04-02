/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

'use strict';
import { FabricConnection } from './FabricConnection';
import { FabricRuntime } from './FabricRuntime';
import { OutputAdapter, LogType } from '../logging/OutputAdapter';
import { FabricWallet } from '../fabric/FabricWallet';
import { IFabricRuntimeConnection } from './IFabricRuntimeConnection';
import { Network, Contract } from 'fabric-network';
import * as Client from 'fabric-client';
import * as ClientCA from 'fabric-ca-client';
import { PackageRegistryEntry } from '../packages/PackageRegistryEntry';
import * as fs from 'fs-extra';

export class FabricRuntimeConnection extends FabricConnection implements IFabricRuntimeConnection {

    constructor(private runtime: FabricRuntime, outputAdapter?: OutputAdapter) {
        super(outputAdapter);
    }

    async connect(wallet: FabricWallet, identityName: string): Promise<void> {
        console.log('FabricRuntimeConnection: connect');
        const connectionProfile: object = await this.runtime.getConnectionProfile();
        await this.connectInner(connectionProfile, wallet, identityName);
    }

    public async getAllInstantiatedChaincodes(): Promise<Array<{name: string, version: string}>> {

        try {
            const channelMap: Map<string, Array<string>> = await this.createChannelMap();
            const channels: Array<string> = Array.from(channelMap.keys());

            const chaincodes: Array<{name: string, version: string}> = []; // We can change the array type if we need more detailed chaincodes in future

            for (const channel of channels) {
                const channelChaincodes: Array<{name: string, version: string}> = await this.getInstantiatedChaincode(channel); // Returns channel chaincodes
                for (const chaincode of channelChaincodes) { // For each channel chaincodes, push it to the 'chaincodes' array if it doesn't exist

                    const alreadyExists: boolean = chaincodes.some((_chaincode: {name: string, version: string}) => {
                        return _chaincode.name === chaincode.name && _chaincode.version === chaincode.version;
                    });
                    if (!alreadyExists) {
                        chaincodes.push(chaincode);
                    }
                }
            }

            return chaincodes;
        } catch (error) {
            throw new Error(`Could not get all instantiated chaincodes: ${error}`);
        }

    }

    public async getOrganizations(channelName: string): Promise<any[]> {
        console.log('getOrganizations', channelName);
        const network: Network = await this.gateway.getNetwork(channelName);
        const channel: Client.Channel = network.getChannel();
        const orgs: any[] = channel.getOrganizations();
        return orgs;
    }

    public getAllCertificateAuthorityNames(): Array<string> {
        const client: Client = this.gateway.getClient();
        const certificateAuthority: any = client.getCertificateAuthority();
        const certificateAuthorityName: string = certificateAuthority.getCaName();
        return [certificateAuthorityName];
    }

    public async getInstalledChaincode(peerName: string): Promise<Map<string, Array<string>>> {
        console.log('getInstalledChaincode', peerName);
        const installedChainCodes: Map<string, Array<string>> = new Map<string, Array<string>>();
        const peer: Client.Peer = this.getPeer(peerName);
        let chaincodeResponse: Client.ChaincodeQueryResponse;
        try {
            chaincodeResponse = await this.gateway.getClient().queryInstalledChaincodes(peer);
        } catch (error) {
            if (error.message && error.message.match(/access denied/)) {
                // Not allowed to do this as we're probably not an administrator.
                // This is probably not the end of the world, so return the empty map.
                return installedChainCodes;
            }
            throw error;
        }
        chaincodeResponse.chaincodes.forEach((chaincode: Client.ChaincodeInfo) => {
            if (installedChainCodes.has(chaincode.name)) {
                installedChainCodes.get(chaincode.name).push(chaincode.version);
            } else {
                installedChainCodes.set(chaincode.name, [chaincode.version]);
            }
        });

        return installedChainCodes;
    }

    public async getAllOrdererNames(): Promise<Array<string>> {

        const ordererSet: Set<string> = new Set();
        const allPeerNames: Array<string> = this.getAllPeerNames();

        for (const peer of allPeerNames) {
            const channels: string[] = await this.getAllChannelsForPeer(peer);
            for (const _channelName of channels) {

                const channel: Client.Channel = await this.getChannel(_channelName);
                const orderers: Client.Orderer[] = channel.getOrderers();

                for (const orderer of orderers) {
                    ordererSet.add(orderer.getName());
                }
            }
        }

        return Array.from(ordererSet);
    }

    public async installChaincode(packageRegistryEntry: PackageRegistryEntry, peerName: string): Promise<void> {
        const peer: Client.Peer = this.getPeer(peerName);
        const pkgBuffer: Buffer = await fs.readFile(packageRegistryEntry.path);
        const installRequest: Client.ChaincodePackageInstallRequest = {
            targets: [peer],
            chaincodePackage: pkgBuffer,
            txId: this.gateway.getClient().newTransactionID()
        };
        const response: Client.ProposalResponseObject = await this.gateway.getClient().installChaincode(installRequest);
        const proposalResponse: Client.ProposalResponse | Error = response[0][0];
        if (proposalResponse instanceof Error) {
            throw proposalResponse;
        } else if (proposalResponse.response.status !== 200) {
            throw new Error(proposalResponse.response.message);
        }
    }

    public async instantiateChaincode(name: string, version: string, channelName: string, fcn: string, args: Array<string>): Promise<any> {

        const transactionId: Client.TransactionId = this.gateway.getClient().newTransactionID();
        const instantiateRequest: Client.ChaincodeInstantiateUpgradeRequest = {
            chaincodeId: name,
            chaincodeVersion: version,
            txId: transactionId,
            fcn: fcn,
            args: args
        };

        const network: Network = await this.gateway.getNetwork(channelName);
        const channel: Client.Channel = network.getChannel();

        const instantiatedChaincode: Array<any> = await this.getInstantiatedChaincode(channelName);

        const foundChaincode: any = this.getChaincode(name, instantiatedChaincode);

        let proposalResponseObject: Client.ProposalResponseObject;

        let message: string;

        if (foundChaincode) {
            throw new Error('The name of the contract you tried to instantiate is already instantiated');
        } else {
            message = `Instantiating with function: '${fcn}' and arguments: '${args}'`;
            this.outputAdapter.log(LogType.INFO, undefined, message);
            proposalResponseObject = await channel.sendInstantiateProposal(instantiateRequest);
        }

        const contract: Contract = network.getContract(name);
        const transaction: any = (contract as any).createTransaction('dummy');

        const responses: any = transaction['_validatePeerResponses'](proposalResponseObject[0]);

        const txId: any = transactionId.getTransactionID();
        const eventHandlerOptions: any = (contract as any).getEventHandlerOptions();
        const eventHandler: any = transaction['_createTxEventHandler'](txId, network, eventHandlerOptions);

        if (!eventHandler) {
            throw new Error('Failed to create an event handler');
        }

        await eventHandler.startListening();

        const transactionRequest: Client.TransactionRequest = {
            proposalResponses: proposalResponseObject[0] as Client.ProposalResponse[],
            proposal: proposalResponseObject[1],
            txId: transactionId
        };

        // Submit the endorsed transaction to the primary orderers.
        const response: Client.BroadcastResponse = await network.getChannel().sendTransaction(transactionRequest);

        if (response.status !== 'SUCCESS') {
            const msg: string = `Failed to send peer responses for transaction ${transactionId.getTransactionID()} to orderer. Response status: ${response.status}`;
            eventHandler.cancelListening();
            throw new Error(msg);
        }

        await eventHandler.waitForEvents();
        // return the payload from the invoked chaincode
        let result: any = null;
        if (responses && responses.validResponses[0].response.payload.length > 0) {
            result = responses.validResponses[0].response.payload;
        }

        eventHandler.cancelListening();

        return result;
    }

    public async upgradeChaincode(name: string, version: string, channelName: string, fcn: string, args: Array<string>): Promise<any> {

        const transactionId: Client.TransactionId = this.gateway.getClient().newTransactionID();
        const upgradeRequest: Client.ChaincodeInstantiateUpgradeRequest = {
            chaincodeId: name,
            chaincodeVersion: version,
            txId: transactionId,
            fcn: fcn,
            args: args
        };

        const network: Network = await this.gateway.getNetwork(channelName);
        const channel: Client.Channel = network.getChannel();

        const instantiatedChaincode: Array<any> = await this.getInstantiatedChaincode(channelName);

        const foundChaincode: any = this.getChaincode(name, instantiatedChaincode);

        let proposalResponseObject: Client.ProposalResponseObject;

        let message: string;

        if (foundChaincode) {
            message = `Upgrading with function: '${fcn}' and arguments: '${args}'`;
            this.outputAdapter.log(LogType.INFO, undefined, message);
            proposalResponseObject = await channel.sendUpgradeProposal(upgradeRequest);
        } else {
            //
            throw new Error('The contract you tried to upgrade with has no previous versions instantiated');
        }

        const contract: Contract = network.getContract(name);
        const transaction: any = (contract as any).createTransaction('dummy');

        const responses: any = transaction['_validatePeerResponses'](proposalResponseObject[0]);

        const txId: any = transactionId.getTransactionID();
        const eventHandlerOptions: any = (contract as any).getEventHandlerOptions();
        const eventHandler: any = transaction['_createTxEventHandler'](txId, network, eventHandlerOptions);

        if (!eventHandler) {
            throw new Error('Failed to create an event handler');
        }

        await eventHandler.startListening();

        const transactionRequest: Client.TransactionRequest = {
            proposalResponses: proposalResponseObject[0] as Client.ProposalResponse[],
            proposal: proposalResponseObject[1],
            txId: transactionId
        };

        // Submit the endorsed transaction to the primary orderers.
        const response: Client.BroadcastResponse = await network.getChannel().sendTransaction(transactionRequest);

        if (response.status !== 'SUCCESS') {
            const msg: string = `Failed to send peer responses for transaction ${transactionId.getTransactionID()} to orderer. Response status: ${response.status}`;
            eventHandler.cancelListening();
            throw new Error(msg);
        }

        await eventHandler.waitForEvents();
        // return the payload from the invoked chaincode
        let result: any = null;
        if (responses && responses.validResponses[0].response.payload.length > 0) {
            result = responses.validResponses[0].response.payload;
        }

        eventHandler.cancelListening();

        return result;
    }

    public async enroll(enrollmentID: string, enrollmentSecret: string): Promise<{certificate: string, privateKey: string}> {
        const enrollment: ClientCA.IEnrollResponse = await this.gateway.getClient().getCertificateAuthority().enroll({ enrollmentID, enrollmentSecret });
        return { certificate: enrollment.certificate, privateKey: enrollment.key.toBytes() };
    }

    public async register(enrollmentID: string, affiliation: string): Promise<string> {
        const request: ClientCA.IRegisterRequest = {
            enrollmentID: enrollmentID,
            affiliation: affiliation,
            role: 'client'
        };
        const registrar: Client.User = this.gateway.getCurrentIdentity();
        const secret: string = await this.gateway.getClient().getCertificateAuthority().register(request, registrar);
        return secret;
    }

    /**
     * Get a chaincode from a list of list of chaincode
     * @param name {String} The name of the chaincode to find
     * @param chaincodeArray {Array<any>} An array of chaincode to search
     * @returns {any} Returns a chaincode from the given array where the name matches the users input
     */
    private getChaincode(name: string, chaincodeArray: Array<any>): any {
        return chaincodeArray.find((chaincode: any) => {
            return chaincode.name === name;
        });
    }

}

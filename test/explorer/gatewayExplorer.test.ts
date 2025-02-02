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
import * as myExtension from '../../src/extension';
import * as vscode from 'vscode';
import * as path from 'path';
import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { FabricConnection } from '../../src/fabric/FabricConnection';
import { BlockchainTreeItem } from '../../src/explorer/model/BlockchainTreeItem';
import { BlockchainGatewayExplorerProvider } from '../../src/explorer/gatewayExplorer';
import { ChannelTreeItem } from '../../src/explorer/model/ChannelTreeItem';
import { FabricConnectionManager } from '../../src/fabric/FabricConnectionManager';
import { ExtensionUtil } from '../../src/util/ExtensionUtil';
import { TestUtil } from '../TestUtil';
import { FabricRuntime } from '../../src/fabric/FabricRuntime';
import { FabricRuntimeManager } from '../../src/fabric/FabricRuntimeManager';
import { FabricGatewayRegistryEntry } from '../../src/fabric/FabricGatewayRegistryEntry';
import { TransactionTreeItem } from '../../src/explorer/model/TransactionTreeItem';
import { InstantiatedContractTreeItem } from '../../src/explorer/model/InstantiatedContractTreeItem';
import { ConnectedTreeItem } from '../../src/explorer/model/ConnectedTreeItem';
import { ContractTreeItem } from '../../src/explorer/model/ContractTreeItem';
import { LocalGatewayTreeItem } from '../../src/explorer/model/LocalGatewayTreeItem';
import { VSCodeBlockchainOutputAdapter } from '../../src/logging/VSCodeBlockchainOutputAdapter';
import { LogType } from '../../src/logging/OutputAdapter';
import { ExtensionCommands } from '../../ExtensionCommands';
import { InstantiatedChaincodeTreeItem } from '../../src/explorer/model/InstantiatedChaincodeTreeItem';
import { GatewayTreeItem } from '../../src/explorer/model/GatewayTreeItem';
import { FabricClientConnection } from '../../src/fabric/FabricClientConnection';
import { GatewayDissociatedTreeItem } from '../../src/explorer/model/GatewayDissociatedTreeItem';
import { GatewayAssociatedTreeItem } from '../../src/explorer/model/GatewayAssociatedTreeItem';
import { FabricWalletUtil } from '../../src/fabric/FabricWalletUtil';
import { FabricRuntimeUtil } from '../../src/fabric/FabricRuntimeUtil';
import { SettingConfigurations } from '../../SettingConfigurations';
import { InstantiatedUnknownTreeItem } from '../../src/explorer/model/InstantiatedUnknownTreeItem';

chai.use(sinonChai);
const should: Chai.Should = chai.should();

// tslint:disable no-unused-expression
describe('gatewayExplorer', () => {

    const rootPath: string = path.dirname(__dirname);

    const mySandBox: sinon.SinonSandbox = sinon.createSandbox();

    before(async () => {
        await TestUtil.setupTests(mySandBox);
        await TestUtil.storeGatewaysConfig();
        await TestUtil.storeRuntimesConfig();
    });

    after(async () => {
        await TestUtil.restoreGatewaysConfig();
        await TestUtil.restoreRuntimesConfig();
    });

    beforeEach(async () => {
        await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_GATEWAYS, [], vscode.ConfigurationTarget.Global);

        const mockRuntime: sinon.SinonStubbedInstance<FabricRuntime> = sinon.createStubInstance(FabricRuntime);
        mockRuntime.getName.returns(FabricRuntimeUtil.LOCAL_FABRIC);
        mockRuntime.isBusy.returns(false);
        mockRuntime.isRunning.resolves(true);
        mySandBox.stub(FabricRuntimeManager.instance(), 'getRuntime').returns(mockRuntime);
        mySandBox.stub(FabricRuntimeManager.instance(), 'getGatewayRegistryEntries').resolves([
            new FabricGatewayRegistryEntry({
                name: FabricRuntimeUtil.LOCAL_FABRIC,
                managedRuntime: true,
                connectionProfilePath: 'connection.json',
                associatedWallet: FabricWalletUtil.LOCAL_WALLET
            })
        ]);
    });

    describe('constructor', () => {

        let logSpy: sinon.SinonSpy;

        beforeEach(async () => {
            logSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
        });

        afterEach(() => {
            mySandBox.restore();
        });

        it('should register for connected events from the connection manager', async () => {
            const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();
            mySandBox.stub(blockchainGatewayExplorerProvider, 'connect').resolves();
            mySandBox.stub(blockchainGatewayExplorerProvider, 'disconnect').resolves();
            const mockConnection: sinon.SinonStubbedInstance<FabricClientConnection> = sinon.createStubInstance(FabricClientConnection);
            const connectionManager: FabricConnectionManager = FabricConnectionManager.instance();
            connectionManager.emit('connected', mockConnection);
            blockchainGatewayExplorerProvider.connect.should.have.been.calledOnce;
        });

        it('should display errors from connected events', async () => {
            const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();
            mySandBox.stub(blockchainGatewayExplorerProvider, 'connect').rejects(new Error('wow such error'));
            mySandBox.stub(blockchainGatewayExplorerProvider, 'disconnect').resolves();
            const mockConnection: sinon.SinonStubbedInstance<FabricClientConnection> = sinon.createStubInstance(FabricClientConnection);
            const connectionManager: FabricConnectionManager = FabricConnectionManager.instance();
            connectionManager.emit('connected', mockConnection);
            // Need to ensure the event handler gets a chance to run.
            await new Promise((resolve: any): any => setTimeout(resolve, 50));
            blockchainGatewayExplorerProvider.connect.should.have.been.calledOnce;
            logSpy.should.have.been.calledOnceWithExactly(LogType.ERROR, 'Error handling connected event: wow such error', 'Error handling connected event: Error: wow such error');
        });

        it('should register for disconnected events from the connection manager', async () => {
            const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();
            mySandBox.stub(blockchainGatewayExplorerProvider, 'connect').resolves();
            mySandBox.stub(blockchainGatewayExplorerProvider, 'disconnect').resolves();
            const connectionManager: FabricConnectionManager = FabricConnectionManager.instance();
            connectionManager.emit('disconnected');
            blockchainGatewayExplorerProvider.disconnect.should.have.been.calledOnceWithExactly();
        });

        it('should display errors from disconnected events', async () => {
            const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();
            mySandBox.stub(blockchainGatewayExplorerProvider, 'connect').resolves();
            mySandBox.stub(blockchainGatewayExplorerProvider, 'disconnect').rejects(new Error('wow such error'));
            const connectionManager: FabricConnectionManager = FabricConnectionManager.instance();
            connectionManager.emit('disconnected');
            // Need to ensure the event handler gets a chance to run.
            await new Promise((resolve: any): any => setTimeout(resolve, 50));
            blockchainGatewayExplorerProvider.disconnect.should.have.been.calledOnceWithExactly();
            logSpy.should.have.been.calledOnceWithExactly(LogType.ERROR, 'Error handling disconnected event: wow such error', 'Error handling disconnected event: Error: wow such error');
        });
    });

    describe('getChildren', () => {

        describe('unconnected tree', () => {

            let getConnectionStub: sinon.SinonStub;
            let logSpy: sinon.SinonSpy;

            beforeEach(async () => {
                getConnectionStub = mySandBox.stub(FabricConnectionManager.instance(), 'getConnection');
                logSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');

                await ExtensionUtil.activateExtension();
            });

            afterEach(() => {
                mySandBox.restore();
            });

            it('should display gateway that has been added in alphabetical order', async () => {
                const gateways: Array<any> = [];

                gateways.push({
                    name: 'myGatewayB',
                    connectionProfilePath: path.join(rootPath, '../../test/data/connectionTwo/connection.json'),
                    associatedWallet: ''
                });

                gateways.push({
                    name: 'myGatewayC',
                    connectionProfilePath: path.join(rootPath, '../../test/data/connectionOne/connection.json'),
                    associatedWallet: 'some_wallet'
                });

                gateways.push({
                    name: 'myGatewayA',
                    connectionProfilePath: path.join(rootPath, '../../test/data/connectionTwo/connection.json'),
                    associatedWallet: 'some_other_wallet'
                });

                gateways.push({
                    name: 'myGatewayA',
                    connectionProfilePath: path.join(rootPath, '../../test/data/connectionTwo/connection.json'),
                    associatedWallet: 'some_other_wallet'
                });

                await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_GATEWAYS, gateways, vscode.ConfigurationTarget.Global);

                const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();
                const allChildren: BlockchainTreeItem[] = await blockchainGatewayExplorerProvider.getChildren();

                allChildren.length.should.equal(5);
                allChildren[1].label.should.equal('myGatewayA ⧉');
                allChildren[1].tooltip.should.equal('ⓘ Associated wallet:\n    some_other_wallet');
                allChildren[1].should.be.an.instanceOf(GatewayAssociatedTreeItem);
                allChildren[2].label.should.equal('myGatewayA ⧉');
                allChildren[2].tooltip.should.equal('ⓘ Associated wallet:\n    some_other_wallet');
                allChildren[2].should.be.an.instanceOf(GatewayAssociatedTreeItem);
                allChildren[3].label.should.equal('myGatewayB');
                allChildren[3].tooltip.should.equal('No associated wallet');
                allChildren[3].should.be.an.instanceOf(GatewayDissociatedTreeItem);
                allChildren[4].label.should.equal('myGatewayC ⧉');
                allChildren[4].tooltip.should.equal('ⓘ Associated wallet:\n    some_wallet');
                allChildren[4].should.be.an.instanceOf(GatewayAssociatedTreeItem);
            });

            it('should handle error with tree', async () => {
                const gateways: Array<any> = [];

                const myGateway: any = {
                    name: 'myGateway',
                    connectionProfilePath: path.join(rootPath, '../../test/data/connectionTwo/connection.json')
                };

                gateways.push(myGateway);

                await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_GATEWAYS, gateways, vscode.ConfigurationTarget.Global);

                const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();

                // @ts-ignore
                mySandBox.stub(blockchainGatewayExplorerProvider, 'createConnectionTree').rejects({ message: 'some error' });

                await blockchainGatewayExplorerProvider.getChildren();

                logSpy.should.have.been.calledWith(LogType.ERROR, 'some error');
            });

            it('should handle errors populating the tree with localGatewayTreeItems', async () => {

                const runtime: any = {
                    name: FabricRuntimeUtil.LOCAL_FABRIC
                };

                await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_GATEWAYS, [], vscode.ConfigurationTarget.Global);
                await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_RUNTIME, runtime, vscode.ConfigurationTarget.Global);

                mySandBox.stub(LocalGatewayTreeItem, 'newLocalGatewayTreeItem').rejects({ message: 'some error' });

                const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();
                await blockchainGatewayExplorerProvider.getChildren();

                logSpy.should.have.been.calledWith(LogType.ERROR, 'Error populating Blockchain Explorer View: some error');
            });

            it('should display the managed runtime', async () => {
                const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();
                const allChildren: BlockchainTreeItem[] = await blockchainGatewayExplorerProvider.getChildren();
                await new Promise((resolve: any): any => {
                    setTimeout(resolve, 0);
                });

                const gateway: FabricGatewayRegistryEntry = new FabricGatewayRegistryEntry();
                gateway.name = FabricRuntimeUtil.LOCAL_FABRIC;
                gateway.managedRuntime = true;
                gateway.connectionProfilePath = 'connection.json';
                gateway.associatedWallet = FabricWalletUtil.LOCAL_WALLET;
                const myCommand: vscode.Command = {
                    command: ExtensionCommands.CONNECT_TO_GATEWAY,
                    title: '',
                    arguments: [gateway]
                };

                allChildren.length.should.equal(1);
                allChildren[0].should.be.an.instanceOf(LocalGatewayTreeItem);
                const localGatewayTreeItem: LocalGatewayTreeItem = allChildren[0] as LocalGatewayTreeItem;
                localGatewayTreeItem.label.should.equal(`${FabricRuntimeUtil.LOCAL_FABRIC_DISPLAY_NAME}  ●`);
                localGatewayTreeItem.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                localGatewayTreeItem.gateway.should.deep.equal(gateway);
                localGatewayTreeItem.command.should.deep.equal(myCommand);
                localGatewayTreeItem.tooltip.should.deep.equal(`Local Fabric is running
ⓘ Associated wallet:
${FabricWalletUtil.LOCAL_WALLET_DISPLAY_NAME}`);
            });

            it('should handle errors thrown when connection fails', async () => {
                const fabricConnection: sinon.SinonStubbedInstance<FabricClientConnection> = sinon.createStubInstance(FabricClientConnection);

                const fabricConnectionManager: FabricConnectionManager = FabricConnectionManager.instance();

                getConnectionStub.returns(fabricConnection);
                getConnectionStub.onCall(1).throws({ message: 'cannot connect' });

                const disconnnectStub: sinon.SinonStub = mySandBox.stub(fabricConnectionManager, 'disconnect').returns(undefined);
                const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();
                await blockchainGatewayExplorerProvider.getChildren();

                disconnnectStub.should.have.been.calledOnce;
                logSpy.should.have.been.calledWith(LogType.ERROR, `cannot connect`);
            });

            it('should error if createChannelMap fails', async () => {

                const fabricConnection: sinon.SinonStubbedInstance<FabricClientConnection> = sinon.createStubInstance(FabricClientConnection);
                getConnectionStub.returns(fabricConnection);
                fabricConnection.getAllPeerNames.returns(['peerOne']);
                fabricConnection.createChannelMap.callThrough();
                fabricConnection.getAllChannelsForPeer.throws({ message: 'some error' });

                const registryEntry: FabricGatewayRegistryEntry = new FabricGatewayRegistryEntry();
                registryEntry.name = 'myGateway';
                registryEntry.connectionProfilePath = 'myPath';
                registryEntry.managedRuntime = false;
                mySandBox.stub(FabricConnectionManager.instance(), 'getGatewayRegistryEntry').returns(registryEntry);

                const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();

                const disconnectSpy: sinon.SinonSpy = mySandBox.spy(blockchainGatewayExplorerProvider, 'disconnect');

                const allChildren: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren();

                await blockchainGatewayExplorerProvider.getChildren(allChildren[2]);

                disconnectSpy.should.have.been.called;
                logSpy.should.have.been.calledWith(LogType.ERROR, `Could not connect to gateway: Error querying channel list: some error`);
            });

            it('should error if gRPC cant connect to Fabric', async () => {

                const fabricConnection: sinon.SinonStubbedInstance<FabricClientConnection> = sinon.createStubInstance(FabricClientConnection);
                getConnectionStub.returns(fabricConnection);
                fabricConnection.getAllPeerNames.returns(['peerOne']);
                fabricConnection.createChannelMap.callThrough();
                fabricConnection.getAllChannelsForPeer.throws({ message: 'Received http2 header with status: 503' });

                const registryEntry: FabricGatewayRegistryEntry = new FabricGatewayRegistryEntry();
                registryEntry.name = 'myGateway';
                registryEntry.connectionProfilePath = 'myPath';
                registryEntry.associatedWallet = 'some_wallet';
                registryEntry.managedRuntime = false;
                mySandBox.stub(FabricConnectionManager.instance(), 'getGatewayRegistryEntry').returns(registryEntry);

                const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();

                const disconnectSpy: sinon.SinonSpy = mySandBox.spy(blockchainGatewayExplorerProvider, 'disconnect');

                const allChildren: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren();

                await blockchainGatewayExplorerProvider.getChildren(allChildren[2]);

                disconnectSpy.should.have.been.called;
                logSpy.should.have.been.calledWith(LogType.ERROR, `Could not connect to gateway: Cannot connect to Fabric: Received http2 header with status: 503`);
            });
        });

        describe('connected tree', () => {

            let allChildren: Array<BlockchainTreeItem>;
            let blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider;
            let fabricConnection: sinon.SinonStubbedInstance<FabricClientConnection>;
            let registryEntry: FabricGatewayRegistryEntry;
            let getGatewayRegistryEntryStub: sinon.SinonStub;
            let logSpy: sinon.SinonSpy;

            beforeEach(async () => {
                logSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');

                await ExtensionUtil.activateExtension();

                fabricConnection = sinon.createStubInstance(FabricClientConnection);

                fabricConnection.getAllPeerNames.returns(['peerOne', 'peerTwo']);

                fabricConnection.getAllPeerNames.returns(['peerOne', 'peerTwo']);
                fabricConnection.getAllChannelsForPeer.withArgs('peerOne').resolves(['channelOne', 'channelTwo']);
                fabricConnection.getAllChannelsForPeer.withArgs('peerTwo').resolves(['channelTwo']);

                fabricConnection.getInstantiatedChaincode.withArgs('channelOne').resolves([{
                    name: 'biscuit-network',
                    version: '0.7'
                }]);
                fabricConnection.getInstantiatedChaincode.withArgs('channelTwo').resolves([{
                    name: 'cake-network',
                    version: '0.10'
                }, {
                    name: 'legacy-network',
                    version: '2.34'
                }]);

                fabricConnection.getMetadata.withArgs('biscuit-network', 'channelOne').resolves(
                    {
                        contracts: {
                            'my-contract': {
                                name: 'my-contract',
                                transactions: [
                                    {
                                        name: 'tradeBiscuits'
                                    },
                                    {
                                        name: 'bourbons'
                                    }
                                ],
                            },
                            'someOtherContract': {
                                name: 'someOtherContract',
                                transactions: [
                                    {
                                        name: 'shortbread'
                                    },
                                    {
                                        name: 'hobnobs'
                                    }
                                ],
                            }
                        }
                    }
                );

                fabricConnection.getMetadata.withArgs('cake-network', 'channelTwo').resolves(
                    {
                        contracts: {
                            'my-contract': {
                                name: 'my-contract',
                                transactions: [],
                            }
                        }
                    }
                );

                const map: Map<string, Array<string>> = new Map<string, Array<string>>();
                map.set('channelOne', ['peerOne']);
                map.set('channelTwo', ['peerOne', 'peerTwo']);

                fabricConnection.getAllChannelsForPeer.withArgs('peerTwo').resolves(['channelTwo']);
                fabricConnection.createChannelMap.resolves(map);
                fabricConnection.identityName = 'pigeon';

                fabricConnection.getMetadata.withArgs('legacy-network', 'channelTwo').resolves(null);

                blockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();
                const fabricConnectionManager: FabricConnectionManager = FabricConnectionManager.instance();
                mySandBox.stub(fabricConnectionManager, 'getConnection').returns((fabricConnection as any) as FabricConnection);

                registryEntry = new FabricGatewayRegistryEntry();
                registryEntry.name = 'myGateway';
                registryEntry.connectionProfilePath = 'myPath';
                registryEntry.associatedWallet = 'some_wallet';
                registryEntry.managedRuntime = false;
                getGatewayRegistryEntryStub = mySandBox.stub(FabricConnectionManager.instance(), 'getGatewayRegistryEntry').returns(registryEntry);
                allChildren = await blockchainGatewayExplorerProvider.getChildren();
            });

            afterEach(() => {
                mySandBox.restore();
            });

            it('should create a connected tree if there is a connection', async () => {
                allChildren.length.should.equal(3);

                const connectedItem1: ConnectedTreeItem = allChildren[0] as ConnectedTreeItem;
                connectedItem1.label.should.equal('Connected via gateway: myGateway');
                connectedItem1.contextValue.should.equal('blockchain-connected-item');
                connectedItem1.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                connectedItem1.connection.name.should.equal('myGateway');

                const connectedItem2: ConnectedTreeItem = allChildren[1] as ConnectedTreeItem;
                connectedItem2.label.should.equal('Using ID: pigeon');
                connectedItem2.contextValue.should.equal('blockchain-connected-item');
                connectedItem2.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                connectedItem2.connection.name.should.equal('myGateway');

                const connectedItem3: ConnectedTreeItem = allChildren[2] as ConnectedTreeItem;
                connectedItem3.label.should.equal('Channels');
                connectedItem3.contextValue.should.equal('blockchain-connected-item');
                connectedItem3.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.Expanded);
                connectedItem3.connection.name.should.equal('myGateway');

                const channels: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;
                const channelOne: ChannelTreeItem = channels[0];

                channelOne.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.Collapsed);
                channelOne.contextValue.should.equal('blockchain-channel-item');
                channelOne.label.should.equal('channelOne');
                channelOne.peers.should.deep.equal(['peerOne']);

                const channelTwo: ChannelTreeItem = channels[1];
                channelTwo.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.Collapsed);
                channelTwo.contextValue.should.equal('blockchain-channel-item');
                channelTwo.label.should.equal('channelTwo');
                channelTwo.peers.should.deep.equal(['peerOne', 'peerTwo']);
            });

            it('should update connected to context value if managed runtime', async () => {
                registryEntry.managedRuntime = true;
                registryEntry.name = FabricRuntimeUtil.LOCAL_FABRIC;
                getGatewayRegistryEntryStub.returns(registryEntry);
                allChildren = await myExtension.getBlockchainGatewayExplorerProvider().getChildren();

                allChildren.length.should.equal(3);

                const connectedItem: ConnectedTreeItem = allChildren[0] as ConnectedTreeItem;
                connectedItem.label.should.equal('Connected via gateway: Local Fabric');
                connectedItem.contextValue.should.equal('blockchain-connected-runtime-item');
                connectedItem.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                connectedItem.connection.name.should.equal('local_fabric');

                const channels: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;
                const channelOne: ChannelTreeItem = channels[0];

                channelOne.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.Collapsed);
                channelOne.contextValue.should.equal('blockchain-channel-item');
                channelOne.label.should.equal('channelOne');
                channelOne.peers.should.deep.equal(['peerOne']);

                const channelTwo: ChannelTreeItem = channels[1];

                channelTwo.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.Collapsed);
                channelTwo.contextValue.should.equal('blockchain-channel-item');
                channelTwo.label.should.equal('channelTwo');
                channelTwo.peers.should.deep.equal(['peerOne', 'peerTwo']);
            });

            it('should create channel children correctly', async () => {

                allChildren.length.should.equal(3);
                const channels: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;

                let instantiatedUnknownChainCodes: Array<InstantiatedUnknownTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channels[0]) as Array<InstantiatedUnknownTreeItem>;
                instantiatedUnknownChainCodes.length.should.equal(1);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);

                const channelChildrenOne: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channels[0]);
                channelChildrenOne.length.should.equal(1);

                const instantiatedTreeItemOne: InstantiatedContractTreeItem = channelChildrenOne[0] as InstantiatedContractTreeItem;
                instantiatedTreeItemOne.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.Collapsed);
                instantiatedTreeItemOne.name.should.equal('biscuit-network');
                instantiatedTreeItemOne.version.should.equal('0.7');
                instantiatedTreeItemOne.label.should.equal('biscuit-network@0.7');
                instantiatedTreeItemOne.contextValue.should.equal('blockchain-instantiated-multi-contract-item');
                instantiatedTreeItemOne.channel.label.should.equal('channelOne');

                instantiatedUnknownChainCodes = await blockchainGatewayExplorerProvider.getChildren(channels[1]) as Array<InstantiatedUnknownTreeItem>;
                instantiatedUnknownChainCodes.length.should.equal(2);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[1]);

                const channelChildrenTwo: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channels[1]);
                channelChildrenTwo.length.should.equal(2);

                const instantiatedTreeItemTwo: InstantiatedContractTreeItem = channelChildrenTwo[0] as InstantiatedContractTreeItem;
                instantiatedTreeItemTwo.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                instantiatedTreeItemTwo.name.should.equal('cake-network');
                instantiatedTreeItemTwo.version.should.equal('0.10');
                instantiatedTreeItemTwo.label.should.equal('cake-network@0.10');
                instantiatedTreeItemTwo.contextValue.should.equal('blockchain-instantiated-contract-item');
                instantiatedTreeItemTwo.channel.label.should.equal('channelTwo');

                const instantiatedTreeItemThree: InstantiatedChaincodeTreeItem = channelChildrenTwo[1] as InstantiatedChaincodeTreeItem;
                instantiatedTreeItemThree.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                instantiatedTreeItemThree.name.should.equal('legacy-network');
                instantiatedTreeItemThree.version.should.equal('2.34');
                instantiatedTreeItemThree.label.should.equal('legacy-network@2.34');
                instantiatedTreeItemThree.contextValue.should.equal('blockchain-instantiated-chaincode-item');
                instantiatedTreeItemThree.channel.label.should.equal('channelTwo');
            });

            it('should not create anything if no peers', async () => {

                fabricConnection.getAllPeerNames.returns([]);

                allChildren = await blockchainGatewayExplorerProvider.getChildren();

                allChildren.length.should.equal(3);
                allChildren[0].label.should.equal('Connected via gateway: myGateway');
            });

            it('should error if problem with instantiate chaincodes', async () => {

                fabricConnection.getInstantiatedChaincode.withArgs('channelOne').rejects({ message: 'some error' });

                allChildren = await blockchainGatewayExplorerProvider.getChildren();
                allChildren.length.should.equal(3);

                const channels: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;

                channels.length.should.equal(2);
                logSpy.should.have.been.calledWith(LogType.ERROR, 'Error getting instantiated smart contracts for channel channelOne some error');

                const channelOne: ChannelTreeItem = channels[0] as ChannelTreeItem;
                channelOne.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                const channelChildrenOne: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelOne);
                channelChildrenOne.length.should.equal(0);
            });

            it('should handle no instantiated chaincodes', async () => {

                fabricConnection.getInstantiatedChaincode.withArgs('channelOne').resolves([]);

                allChildren = await blockchainGatewayExplorerProvider.getChildren();
                allChildren.length.should.equal(3);

                const channels: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;
                channels.length.should.equal(2);

                const channelOne: ChannelTreeItem = channels[0] as ChannelTreeItem;
                channelOne.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                channelOne.contextValue.should.equal('blockchain-channel-item');
                channelOne.label.should.equal('channelOne');
                channelOne.peers.should.deep.equal(['peerOne']);
                const channelChildrenOne: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelOne);
                channelChildrenOne.length.should.equal(0);

                const channelTwo: ChannelTreeItem = channels[1];
                channelTwo.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.Collapsed);
                channelTwo.contextValue.should.equal('blockchain-channel-item');
                channelTwo.label.should.equal('channelTwo');
                channelTwo.peers.should.deep.equal(['peerOne', 'peerTwo']);

                const instantiatedUnknownChainCodes: Array<InstantiatedUnknownTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelTwo) as Array<InstantiatedUnknownTreeItem>;
                instantiatedUnknownChainCodes.length.should.equal(2);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[1]);

                const channelChildrenTwo: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelTwo);
                channelChildrenTwo.length.should.equal(2);

                const instantiatedTreeItemTwo: InstantiatedContractTreeItem = channelChildrenTwo[0] as InstantiatedContractTreeItem;
                instantiatedTreeItemTwo.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                instantiatedTreeItemTwo.name.should.equal('cake-network');
                instantiatedTreeItemTwo.version.should.equal('0.10');
                instantiatedTreeItemTwo.label.should.equal('cake-network@0.10');
                instantiatedTreeItemTwo.contextValue.should.equal('blockchain-instantiated-contract-item');
                instantiatedTreeItemTwo.channel.label.should.equal('channelTwo');

                const instantiatedTreeItemThree: InstantiatedChaincodeTreeItem = channelChildrenTwo[1] as InstantiatedChaincodeTreeItem;
                instantiatedTreeItemThree.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                instantiatedTreeItemThree.name.should.equal('legacy-network');
                instantiatedTreeItemThree.version.should.equal('2.34');
                instantiatedTreeItemThree.label.should.equal('legacy-network@2.34');
                instantiatedTreeItemThree.contextValue.should.equal('blockchain-instantiated-chaincode-item');
                instantiatedTreeItemThree.channel.label.should.equal('channelTwo');

                logSpy.should.not.have.been.calledWith(LogType.ERROR);
            });

            it('should create instantiated chaincode correctly', async () => {

                allChildren = await blockchainGatewayExplorerProvider.getChildren();
                allChildren.length.should.equal(3);

                const channels: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;

                let instantiatedUnknownChainCodes: Array<InstantiatedUnknownTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channels[0]) as Array<InstantiatedUnknownTreeItem>;
                instantiatedUnknownChainCodes.length.should.equal(1);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);

                const channelOne: ChannelTreeItem = channels[0] as ChannelTreeItem;

                const channelChildrenOne: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelOne);
                channelChildrenOne.length.should.equal(1);

                const instantiatedChaincodeItemOne: InstantiatedContractTreeItem = channelChildrenOne[0] as InstantiatedContractTreeItem;

                instantiatedChaincodeItemOne.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.Collapsed);
                instantiatedChaincodeItemOne.contextValue.should.equal('blockchain-instantiated-multi-contract-item');
                instantiatedChaincodeItemOne.label.should.equal('biscuit-network@0.7');
                instantiatedChaincodeItemOne.channel.should.equal(channelOne);
                instantiatedChaincodeItemOne.version.should.equal('0.7');
                instantiatedChaincodeItemOne.contracts.should.deep.equal(['my-contract', 'someOtherContract']);

                const channelTwo: ChannelTreeItem = channels[1] as ChannelTreeItem;

                instantiatedUnknownChainCodes = await blockchainGatewayExplorerProvider.getChildren(channels[1]) as Array<InstantiatedUnknownTreeItem>;
                instantiatedUnknownChainCodes.length.should.equal(2);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[1]);

                const channelChildrenTwo: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelTwo);
                channelChildrenTwo.length.should.equal(2);

                const instantiatedChaincodeItemTwo: InstantiatedContractTreeItem = channelChildrenTwo[0] as InstantiatedContractTreeItem;

                instantiatedChaincodeItemTwo.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                instantiatedChaincodeItemTwo.contextValue.should.equal('blockchain-instantiated-contract-item');
                instantiatedChaincodeItemTwo.label.should.equal('cake-network@0.10');
                instantiatedChaincodeItemTwo.channel.should.equal(channelTwo);
                instantiatedChaincodeItemTwo.version.should.equal('0.10');
                instantiatedChaincodeItemTwo.contracts.should.deep.equal([]);

                const instantiatedChaincodeItemThree: InstantiatedChaincodeTreeItem = channelChildrenTwo[1] as InstantiatedChaincodeTreeItem;

                instantiatedChaincodeItemThree.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                instantiatedChaincodeItemThree.contextValue.should.equal('blockchain-instantiated-chaincode-item');
                instantiatedChaincodeItemThree.label.should.equal('legacy-network@2.34');
                instantiatedChaincodeItemThree.channel.should.equal(channelTwo);
                instantiatedChaincodeItemThree.version.should.equal('2.34');
                should.equal(instantiatedChaincodeItemThree.contracts, null);

                logSpy.should.not.have.been.calledWith(LogType.ERROR);
            });

            it('should create the contract tree correctly', async () => {
                allChildren = await blockchainGatewayExplorerProvider.getChildren();
                allChildren.length.should.equal(3);

                const channels: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;

                const channelOne: ChannelTreeItem = channels[0] as ChannelTreeItem;

                let instantiatedUnknownChainCodes: Array<InstantiatedUnknownTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelOne) as Array<InstantiatedUnknownTreeItem>;
                instantiatedUnknownChainCodes.length.should.equal(1);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);

                const channelChildrenOne: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelOne);
                channelChildrenOne.length.should.equal(1);

                const instantiatedChaincodeItemOne: InstantiatedContractTreeItem = channelChildrenOne[0] as InstantiatedContractTreeItem;

                const contractsOne: Array<ContractTreeItem> = await blockchainGatewayExplorerProvider.getChildren(instantiatedChaincodeItemOne) as Array<ContractTreeItem>;
                contractsOne.length.should.equal(2);
                contractsOne[0].label.should.equal('my-contract');
                contractsOne[0].instantiatedChaincode.name.should.equal('biscuit-network');
                contractsOne[0].instantiatedChaincode.channel.label.should.equal('channelOne');
                contractsOne[0].collapsibleState.should.equal(vscode.TreeItemCollapsibleState.Collapsed);
                contractsOne[1].label.should.equal('someOtherContract');
                contractsOne[1].instantiatedChaincode.name.should.equal('biscuit-network');
                contractsOne[1].instantiatedChaincode.channel.label.should.equal('channelOne');
                contractsOne[1].collapsibleState.should.equal(vscode.TreeItemCollapsibleState.Collapsed);

                const channelTwo: ChannelTreeItem = channels[1] as ChannelTreeItem;

                instantiatedUnknownChainCodes = await blockchainGatewayExplorerProvider.getChildren(channelTwo) as Array<InstantiatedUnknownTreeItem>;
                instantiatedUnknownChainCodes.length.should.equal(2);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);

                const channelChildrenTwo: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelTwo);
                channelChildrenTwo.length.should.equal(2);

                const instantiatedChaincodeItemTwo: InstantiatedContractTreeItem = channelChildrenTwo[0] as InstantiatedContractTreeItem;
                const contractsTwo: Array<ContractTreeItem> = await blockchainGatewayExplorerProvider.getChildren(instantiatedChaincodeItemTwo) as Array<ContractTreeItem>;
                contractsTwo.should.deep.equal([]);
                instantiatedChaincodeItemTwo.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);

                logSpy.should.not.have.been.calledWith(LogType.ERROR);
            });

            it('should show the transactions and not contracts if the contract name is empty', async () => {
                fabricConnection.getMetadata.withArgs('biscuit-network', 'channelOne').resolves(
                    {
                        contracts: {
                            '': {
                                name: '',
                                transactions: [
                                    {
                                        name: 'tradeBiscuits'
                                    },
                                    {
                                        name: 'bourbons'
                                    }
                                ],
                            }
                        }
                    }
                );

                allChildren = await blockchainGatewayExplorerProvider.getChildren();
                allChildren.length.should.equal(3);

                const channels: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;

                const channelOne: ChannelTreeItem = channels[0] as ChannelTreeItem;

                const instantiatedUnknownChainCodes: Array<InstantiatedUnknownTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelOne) as Array<InstantiatedUnknownTreeItem>;
                instantiatedUnknownChainCodes.length.should.equal(1);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);

                const channelChildrenOne: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelOne);
                channelChildrenOne.length.should.equal(1);

                const instantiatedChaincodeItemOne: InstantiatedContractTreeItem = channelChildrenOne[0] as InstantiatedContractTreeItem;

                const transactions: Array<TransactionTreeItem> = await blockchainGatewayExplorerProvider.getChildren(instantiatedChaincodeItemOne) as Array<TransactionTreeItem>;
                transactions.length.should.equal(2);
                transactions[0].label.should.equal('tradeBiscuits');
                transactions[0].chaincodeName.should.equal('biscuit-network');
                transactions[0].channelName.should.equal('channelOne');
                transactions[0].collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                transactions[0].contractName.should.equal('');
                transactions[1].label.should.equal('bourbons');
                transactions[1].chaincodeName.should.equal('biscuit-network');
                transactions[1].channelName.should.equal('channelOne');
                transactions[1].collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                transactions[1].contractName.should.equal('');

                logSpy.should.not.have.been.calledWith(LogType.ERROR);
            });

            it('should show the transactions and not contracts if there is only one contract', async () => {
                fabricConnection.getMetadata.withArgs('cake-network', 'channelTwo').resolves(
                    {
                        contracts: {
                            'my-contract': {
                                name: 'my-contract',
                                transactions: [
                                    {
                                        name: 'garabaldi'
                                    },
                                    {
                                        name: 'shortbread'
                                    }
                                ],
                            }
                        }
                    }
                );
                const channels: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;

                const instantiatedUnknownChainCodes: Array<InstantiatedUnknownTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channels[1]) as Array<InstantiatedUnknownTreeItem>;
                instantiatedUnknownChainCodes.length.should.equal(2);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[1]);

                const channelChildren: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channels[1]);

                const instantiatedChaincodeItemOne: InstantiatedContractTreeItem = channelChildren[0] as InstantiatedContractTreeItem;

                const transactions: Array<TransactionTreeItem> = await blockchainGatewayExplorerProvider.getChildren(instantiatedChaincodeItemOne) as Array<TransactionTreeItem>;
                transactions.length.should.equal(2);
                transactions[0].label.should.equal('garabaldi');
                transactions[0].chaincodeName.should.equal('cake-network');
                transactions[0].channelName.should.equal('channelTwo');
                transactions[0].collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                transactions[0].contractName.should.equal('my-contract');
                transactions[1].label.should.equal('shortbread');
                transactions[1].chaincodeName.should.equal('cake-network');
                transactions[1].channelName.should.equal('channelTwo');
                transactions[1].collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                transactions[1].contractName.should.equal('my-contract');

                logSpy.should.not.have.been.calledWith(LogType.ERROR);
            });

            it('should create the transactions correctly', async () => {

                allChildren = await blockchainGatewayExplorerProvider.getChildren();
                allChildren.length.should.equal(3);

                const channels: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;

                const channelOne: ChannelTreeItem = channels[0] as ChannelTreeItem;

                let instantiatedUnknownChainCodes: Array<InstantiatedUnknownTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelOne) as Array<InstantiatedUnknownTreeItem>;
                instantiatedUnknownChainCodes.length.should.equal(1);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);

                const channelChildrenOne: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelOne);
                channelChildrenOne.length.should.equal(1);

                const instantiatedChaincodeItemOne: InstantiatedContractTreeItem = channelChildrenOne[0] as InstantiatedContractTreeItem;

                const contractsOne: Array<ContractTreeItem> = await blockchainGatewayExplorerProvider.getChildren(instantiatedChaincodeItemOne) as Array<ContractTreeItem>;

                const transactionsOneMyContract: Array<TransactionTreeItem> = await blockchainGatewayExplorerProvider.getChildren(contractsOne[0]) as Array<TransactionTreeItem>;

                transactionsOneMyContract.length.should.equal(2);
                transactionsOneMyContract[0].label.should.equal('tradeBiscuits');
                transactionsOneMyContract[0].chaincodeName.should.equal('biscuit-network');
                transactionsOneMyContract[0].channelName.should.equal('channelOne');
                transactionsOneMyContract[0].collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                transactionsOneMyContract[0].contractName.should.equal('my-contract');
                transactionsOneMyContract[1].label.should.equal('bourbons');
                transactionsOneMyContract[1].chaincodeName.should.equal('biscuit-network');
                transactionsOneMyContract[1].channelName.should.equal('channelOne');
                transactionsOneMyContract[1].collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                transactionsOneMyContract[1].contractName.should.equal('my-contract');

                const transactionsOneSomeOtherContract: Array<TransactionTreeItem> = await blockchainGatewayExplorerProvider.getChildren(contractsOne[1]) as Array<TransactionTreeItem>;
                transactionsOneSomeOtherContract.length.should.equal(2);
                transactionsOneSomeOtherContract[0].label.should.equal('shortbread');
                transactionsOneSomeOtherContract[0].chaincodeName.should.equal('biscuit-network');
                transactionsOneSomeOtherContract[0].channelName.should.equal('channelOne');
                transactionsOneSomeOtherContract[0].collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                transactionsOneSomeOtherContract[0].contractName.should.equal('someOtherContract');
                transactionsOneSomeOtherContract[1].label.should.equal('hobnobs');
                transactionsOneSomeOtherContract[1].chaincodeName.should.equal('biscuit-network');
                transactionsOneSomeOtherContract[1].channelName.should.equal('channelOne');
                transactionsOneSomeOtherContract[1].collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);
                transactionsOneSomeOtherContract[1].contractName.should.equal('someOtherContract');

                const channelTwo: ChannelTreeItem = channels[1] as ChannelTreeItem;

                instantiatedUnknownChainCodes = await blockchainGatewayExplorerProvider.getChildren(channelTwo) as Array<InstantiatedUnknownTreeItem>;
                instantiatedUnknownChainCodes.length.should.equal(2);
                await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);

                const channelChildrenTwo: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelTwo);
                channelChildrenTwo.length.should.equal(2);

                const instantiatedChaincodeItemTwo: InstantiatedContractTreeItem = channelChildrenTwo[0] as InstantiatedContractTreeItem;

                instantiatedChaincodeItemTwo.collapsibleState.should.equal(vscode.TreeItemCollapsibleState.None);

                logSpy.should.not.have.been.calledWith(LogType.ERROR);
            });
        });
    });

    describe('refresh', () => {

        beforeEach(async () => {
            await ExtensionUtil.activateExtension();
        });

        afterEach(() => {
            mySandBox.restore();
        });

        it('should test the tree is refreshed when the refresh command is run', async () => {

            const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();

            const onDidChangeTreeDataSpy: sinon.SinonSpy = mySandBox.spy(blockchainGatewayExplorerProvider['_onDidChangeTreeData'], 'fire');

            await vscode.commands.executeCommand(ExtensionCommands.REFRESH_GATEWAYS);

            onDidChangeTreeDataSpy.should.have.been.called;
        });

        it('should test the tree is refreshed when the refresh command is run', async () => {

            const mockTreeItem: sinon.SinonStubbedInstance<GatewayTreeItem> = sinon.createStubInstance(GatewayTreeItem);

            const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();

            const onDidChangeTreeDataSpy: sinon.SinonSpy = mySandBox.spy(blockchainGatewayExplorerProvider['_onDidChangeTreeData'], 'fire');

            await vscode.commands.executeCommand(ExtensionCommands.REFRESH_GATEWAYS, mockTreeItem);

            onDidChangeTreeDataSpy.should.have.been.calledOnceWithExactly(mockTreeItem);
        });
    });

    describe('connect', () => {

        beforeEach(async () => {
            await ExtensionUtil.activateExtension();
        });

        afterEach(() => {
            mySandBox.restore();
        });

        it('should set the current client connection', async () => {

            const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();

            const onDidChangeTreeDataSpy: sinon.SinonSpy = mySandBox.spy(blockchainGatewayExplorerProvider['_onDidChangeTreeData'], 'fire');

            const executeCommandSpy: sinon.SinonSpy = mySandBox.spy(vscode.commands, 'executeCommand');

            await blockchainGatewayExplorerProvider.connect();

            onDidChangeTreeDataSpy.should.have.been.called;

            executeCommandSpy.should.have.been.calledOnce;
            executeCommandSpy.getCall(0).should.have.been.calledWith('setContext', 'blockchain-gateway-connected', true);
        });
    });

    describe('disconnect', () => {

        beforeEach(async () => {
            await ExtensionUtil.activateExtension();
        });

        afterEach(() => {
            mySandBox.restore();
        });

        it('should disconnect the client connection', async () => {
            const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();

            const onDidChangeTreeDataSpy: sinon.SinonSpy = mySandBox.spy(blockchainGatewayExplorerProvider['_onDidChangeTreeData'], 'fire');

            const executeCommandSpy: sinon.SinonSpy = mySandBox.spy(vscode.commands, 'executeCommand');

            await blockchainGatewayExplorerProvider.disconnect();

            onDidChangeTreeDataSpy.should.have.been.called;

            executeCommandSpy.should.have.been.calledOnce;
            executeCommandSpy.getCall(0).should.have.been.calledWith('setContext', 'blockchain-gateway-connected', false);
        });
    });

    describe('getTreeItem', () => {

        beforeEach(async () => {
            await ExtensionUtil.activateExtension();
        });

        afterEach(() => {
            mySandBox.restore();
        });

        it('should get a tree item', async () => {
            const myGateway: any = {
                name: 'myGateway',
                connectionProfilePath: path.join(rootPath, '../../test/data/connectionTwo/connection.json')
            };

            await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_GATEWAYS, [myGateway], vscode.ConfigurationTarget.Global);

            const blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();
            const allChildren: Array<BlockchainTreeItem> = await blockchainGatewayExplorerProvider.getChildren();

            const result: GatewayTreeItem = blockchainGatewayExplorerProvider.getTreeItem(allChildren[1]) as GatewayTreeItem;

            result.label.should.equal('myGateway');
        });
    });
});

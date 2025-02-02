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
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as chai from 'chai';
import * as ejs from 'ejs';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as os from 'os';
import { TestUtil } from '../TestUtil';
import { FabricConnectionManager } from '../../src/fabric/FabricConnectionManager';
import { UserInputUtil, LanguageType } from '../../src/commands/UserInputUtil';
import { BlockchainTreeItem } from '../../src/explorer/model/BlockchainTreeItem';
import { BlockchainGatewayExplorerProvider } from '../../src/explorer/gatewayExplorer';
import * as myExtension from '../../src/extension';
import { ChannelTreeItem } from '../../src/explorer/model/ChannelTreeItem';
import { Reporter } from '../../src/util/Reporter';
import { FabricClientConnection } from '../../src/fabric/FabricClientConnection';
import { CommandUtil } from '../../src/util/CommandUtil';
import { InstantiatedContractTreeItem } from '../../src/explorer/model/InstantiatedContractTreeItem';
import { FabricGatewayRegistryEntry } from '../../src/fabric/FabricGatewayRegistryEntry';
import { FabricWalletRegistryEntry } from '../../src/fabric/FabricWalletRegistryEntry';
import { VSCodeBlockchainOutputAdapter } from '../../src/logging/VSCodeBlockchainOutputAdapter';
import { LogType } from '../../src/logging/OutputAdapter';
import { ExtensionCommands } from '../../ExtensionCommands';
import { ContractTreeItem } from '../../src/explorer/model/ContractTreeItem';
import { FABRIC_CLIENT_VERSION, FABRIC_NETWORK_VERSION } from '../../src/util/ExtensionUtil';
import { InstantiatedUnknownTreeItem } from '../../src/explorer/model/InstantiatedUnknownTreeItem';

const should: Chai.Should = chai.should();
chai.use(sinonChai);
// tslint:disable no-unused-expression

describe('testSmartContractCommand', () => {
    let mySandBox: sinon.SinonSandbox = sinon.createSandbox();
    let fabricClientConnectionMock: sinon.SinonStubbedInstance<FabricClientConnection>;
    let executeCommandStub: sinon.SinonStub;
    let logSpy: sinon.SinonSpy;
    let fsRemoveStub: sinon.SinonStub;
    let sendTelemetryEventStub: sinon.SinonStub;
    let getConnectionStub: sinon.SinonStub;
    let showInstantiatedSmartContractsQuickPickStub: sinon.SinonStub;
    let openTextDocumentStub: sinon.SinonStub;
    let showTextDocumentStub: sinon.SinonStub;
    let allChildren: Array<BlockchainTreeItem>;
    let blockchainGatewayExplorerProvider: BlockchainGatewayExplorerProvider;
    let fabricConnectionManager: FabricConnectionManager;
    let chaincodes: any[];
    let instantiatedSmartContract: InstantiatedContractTreeItem;
    let smartContractName: string;
    let smartContractLabel: string;
    const rootPath: string = vscode.Uri.file(path.dirname(__dirname)).fsPath;
    let testFileDir: string;
    let mockDocumentStub: any;
    let mockDocumentSaveSpy: sinon.SinonSpy;
    let mockEditBuilder: any;
    let mockEditBuilderReplaceSpy: sinon.SinonSpy;
    let mockTextEditor: any;
    let readFileStub: sinon.SinonStub;
    let workspaceFoldersStub: sinon.SinonStub;
    let sendCommandStub: sinon.SinonStub;
    let showLanguageQuickPickStub: sinon.SinonStub;
    let gatewayRegistryEntry: FabricGatewayRegistryEntry;
    let walletRegistryEntry: FabricWalletRegistryEntry;
    let getGatewayRegistryStub: sinon.SinonStub;
    let getIdentityNameStub: sinon.SinonStub;
    let getWalletRegistryStub: sinon.SinonStub;
    let getConfigurationStub: sinon.SinonStub;
    let workspaceConfigurationUpdateStub: sinon.SinonStub;
    let workspaceConfigurationGetStub: sinon.SinonStub;
    let writeJsonStub: sinon.SinonStub;
    let fakeMetadata: any;
    let moreFakeMetadata: any;
    let transactionOne: any;
    let transactionTwo: any;
    let transactionThree: any;
    let packageJSONPath: vscode.Uri;
    const tsConfigContents: any = {
        compilerOptions: {
            declaration: true,
            module: 'commonjs',
            moduleResolution: 'node',
            outDir: 'dist',
            sourceMap: true,
            target: 'es2017'
        },
        exclude: ['node_modules'],
        include: ['./functionalTests/**/*']
    };
    const tsConfigFormat: any = { spaces: '\t' };

    before(async () => {
        await TestUtil.setupTests(mySandBox);
    });

    afterEach(async () => {
        mySandBox.restore();
        await vscode.commands.executeCommand(ExtensionCommands.DISCONNECT_GATEWAY);
        await TestUtil.deleteTestFiles(testFileDir);
    });

    describe('Generate tests for Fabric Client Connection instantiated smart contract', () => {

        beforeEach(async () => {
            mySandBox = sinon.createSandbox();
            logSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
            sendTelemetryEventStub = mySandBox.stub(Reporter.instance(), 'sendTelemetryEvent');
            fsRemoveStub = mySandBox.stub(fs, 'remove').resolves();
            // ExecuteCommand stub
            executeCommandStub = mySandBox.stub(vscode.commands, 'executeCommand');
            executeCommandStub.withArgs(ExtensionCommands.CONNECT_TO_GATEWAY).resolves();
            executeCommandStub.callThrough();
            fabricClientConnectionMock = sinon.createStubInstance(FabricClientConnection);
            fabricClientConnectionMock.connect.resolves();
            fakeMetadata = {
                contracts: {
                    'my-contract': {
                        name: 'my-contract',
                        transactions: [
                            {
                                name: 'instantiate',
                                parameters: [
                                    {
                                        name: 'eggs',
                                        schema: {
                                            type: 'string'
                                        }
                                    },
                                    {
                                        name: 'cake',
                                        schema: {
                                            type: 'number'
                                        }
                                    },
                                    {
                                        name: 'sugar',
                                    },
                                    {
                                        name: 'flour',
                                        schema: {
                                            type: 'boolean'
                                        }
                                    },
                                    {
                                        name: 'butter',
                                    },
                                    {
                                        name: 'milk',
                                        schema: {
                                            type: 'array'
                                        }
                                    }
                                ]
                            },
                            {
                                name: 'wagonwheeling',
                                parameters: []
                            },
                            {
                                name: 'transaction2'
                            }
                        ]
                    }
                }
            };

            moreFakeMetadata = {
                contracts: {
                    'my-contract': {
                        name: 'my-contract',
                        transactions: [
                            {
                                name: 'instantiate',
                                parameters: [
                                    {
                                        name: 'eggs',
                                        schema: {
                                            type: 'string'
                                        }
                                    },
                                    {
                                        name: 'sugar',
                                    },
                                ]
                            },
                            {
                                name: 'wagonwheeling',
                                parameters: []
                            }
                        ]
                    },
                    'my-other-contract': {
                        name: 'my-other-contract',
                        transactions: [
                            {
                                name: 'instantiate',
                                parameters: [
                                    {
                                        name: 'chocolate',
                                        schema: {
                                            type: 'string'
                                        }
                                    }
                                ]
                            },
                            {
                                name: 'upgrade'
                            }
                        ]
                    }
                }
            };
            transactionOne = fakeMetadata.contracts['my-contract'].transactions[0];
            transactionTwo = fakeMetadata.contracts['my-contract'].transactions[1];
            transactionThree = fakeMetadata.contracts['my-contract'].transactions[2];
            fabricClientConnectionMock.getMetadata.resolves(fakeMetadata);
            const map: Map<string, Array<string>> = new Map<string, Array<string>>();
            map.set('myEnglishChannel', ['peerOne']);
            fabricClientConnectionMock.createChannelMap.resolves(map);
            fabricConnectionManager = FabricConnectionManager.instance();
            getConnectionStub = mySandBox.stub(fabricConnectionManager, 'getConnection').returns(fabricClientConnectionMock);

            gatewayRegistryEntry = new FabricGatewayRegistryEntry();
            gatewayRegistryEntry.name = 'myGateway';
            gatewayRegistryEntry.connectionProfilePath = 'myPath';
            gatewayRegistryEntry.managedRuntime = false;
            getGatewayRegistryStub = mySandBox.stub(fabricConnectionManager, 'getGatewayRegistryEntry');
            getGatewayRegistryStub.returns(gatewayRegistryEntry);
            fabricClientConnectionMock.getAllPeerNames.returns(['peerOne']);
            fabricClientConnectionMock.getAllChannelsForPeer.withArgs('peerOne').resolves(['myEnglishChannel']);
            fabricClientConnectionMock.getInstantiatedChaincode.resolves([
                {
                    name: 'wagonwheel',
                    version: '0.0.1',
                    label: 'wagonwheel@0.0.1',
                    channel: 'myEnglishChannel'
                }
            ]);
            // Wallet stubs
            walletRegistryEntry = new FabricWalletRegistryEntry();
            walletRegistryEntry.name = 'myWallet';
            walletRegistryEntry.walletPath = 'walletPath';
            getWalletRegistryStub = mySandBox.stub(fabricConnectionManager, 'getConnectionWallet');
            getIdentityNameStub = mySandBox.stub(fabricConnectionManager, 'getConnectionIdentity');
            getWalletRegistryStub.returns(walletRegistryEntry);
            getIdentityNameStub.returns('Admin');
            // UserInputUtil stubs
            showInstantiatedSmartContractsQuickPickStub = mySandBox.stub(UserInputUtil, 'showClientInstantiatedSmartContractsQuickPick').withArgs(sinon.match.any).resolves({
                label: 'wagonwheel@0.0.1',
                data: { name: 'wagonwheel', channel: 'myEnglishChannel', version: '0.0.1' }
            });
            // Explorer provider stuff
            blockchainGatewayExplorerProvider = myExtension.getBlockchainGatewayExplorerProvider();
            allChildren = await blockchainGatewayExplorerProvider.getChildren();
            const channelChildren: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;
            chaincodes = channelChildren[0].chaincodes;
            instantiatedSmartContract = chaincodes[0] as InstantiatedContractTreeItem;

            smartContractLabel = instantiatedSmartContract.label;
            smartContractName = instantiatedSmartContract.name;
            // Document editor stubs
            testFileDir = path.join(rootPath, '..', '..', 'data', 'smartContractTests');
            mockDocumentStub = {
                lineCount: 8,
                save: (): any => {
                    return Promise.resolve();
                }
            };
            mockDocumentSaveSpy = mySandBox.spy(mockDocumentStub, 'save');
            mockEditBuilder = {
                replace: (): any => {
                    return Promise.resolve();
                }
            };
            mockEditBuilderReplaceSpy = mySandBox.spy(mockEditBuilder, 'replace');
            mockTextEditor = {
                edit: mySandBox.stub()
            };
            mockTextEditor.edit.yields(mockEditBuilder);
            mockTextEditor.edit.resolves(true);
            openTextDocumentStub = mySandBox.stub(vscode.workspace, 'openTextDocument').resolves(mockDocumentStub);
            showTextDocumentStub = mySandBox.stub(vscode.window, 'showTextDocument').resolves(mockTextEditor);
            packageJSONPath = vscode.Uri.file(path.join(testFileDir, 'package.json'));
            mySandBox.stub(vscode.workspace, 'findFiles').resolves([packageJSONPath]);
            const smartContractNameBuffer: Buffer = Buffer.from(`{"name": "${smartContractName}"}`);
            readFileStub = mySandBox.stub(fs, 'readFile').resolves(smartContractNameBuffer);
            workspaceFoldersStub = mySandBox.stub(UserInputUtil, 'getWorkspaceFolders').returns([{ name: 'wagonwheeling' }]);
            writeJsonStub = mySandBox.stub(fs, 'writeJson').resolves();
            // Other stubs
            sendCommandStub = mySandBox.stub(CommandUtil, 'sendCommand').resolves('some npm install output');
            showLanguageQuickPickStub = mySandBox.stub(UserInputUtil, 'showLanguagesQuickPick').resolves({ label: 'JavaScript', type: LanguageType.CONTRACT });
            workspaceConfigurationUpdateStub = mySandBox.stub();
            workspaceConfigurationGetStub = mySandBox.stub();
        });

        it('should generate a javascript test file for a selected instantiated smart contract', async () => {
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();
            const testFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.js`);
            const testFunctionFilePath: string = path.join(testFileDir, 'functionalTests', 'js-smart-contract-util.js');
            const testUri: vscode.Uri = vscode.Uri.file(testFilePath);
            const testFunctionUri: vscode.Uri = vscode.Uri.file(testFunctionFilePath);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract as InstantiatedUnknownTreeItem);
            openTextDocumentStub.should.have.been.calledWith(testUri.fsPath);
            openTextDocumentStub.should.have.been.calledWith(testFunctionUri.fsPath);
            openTextDocumentStub.should.have.been.calledTwice;
            showTextDocumentStub.should.have.been.calledTwice;
            const templateData: string = mockEditBuilderReplaceSpy.args[1][1];
            templateData.should.not.equal('');
            templateData.includes(smartContractLabel).should.be.true;
            templateData.includes(transactionOne.name).should.be.true;
            templateData.includes(transactionTwo.name).should.be.true;
            templateData.includes(transactionThree.name).should.be.true;
            templateData.startsWith('/*').should.be.true;
            templateData.includes('gateway.connect').should.be.true;
            templateData.includes('homedir').should.be.false;
            templateData.includes('walletPath').should.be.true;
            templateData.includes('submitTransaction').should.be.true;
            templateData.includes('require').should.be.true;
            templateData.includes(`const args = [];`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[0].name.replace(`"`, '')} = 'EXAMPLE';`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[1].name.replace(`"`, '')} = 0;`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[2].name.replace(`"`, '')} = {};`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[3].name.replace(`"`, '')} = true;`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[4].name.replace(`"`, '')} = {};`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[5].name.replace(`"`, '')} = [];`).should.be.true;
            templateData.includes(`const args = [ ${transactionOne.parameters[0].name.replace(`"`, '')}, ${transactionOne.parameters[1].name.replace(`"`, '')}.toString(), JSON.stringify(${transactionOne.parameters[2].name.replace(`"`, '')}), ${transactionOne.parameters[3].name.replace(`"`, '')}.toString(), JSON.stringify(${transactionOne.parameters[4].name.replace(`"`, '')}), JSON.stringify(${transactionOne.parameters[5].name.replace(`"`, '')})];`).should.be.true;
            templateData.includes('Admin').should.be.true;
            const functionTemplateData: string = mockEditBuilderReplaceSpy.args[0][1];
            functionTemplateData.should.not.equal('');
            functionTemplateData.includes('getConnectionProfile').should.be.true;
            functionTemplateData.includes('submitTransaction').should.be.true;
            functionTemplateData.includes('isLocalhostURL').should.be.true;
            functionTemplateData.includes('hasLocalhostURLs').should.be.true;
            sendCommandStub.should.have.been.calledOnce;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, `Installing package dependencies including: fabric-network@${FABRIC_NETWORK_VERSION}, fabric-client@${FABRIC_CLIENT_VERSION}`);
            logSpy.getCall(3).should.have.been.calledWith(LogType.INFO, undefined, 'some npm install output');
            logSpy.getCall(4).should.have.been.calledWith(LogType.SUCCESS, 'Successfully generated tests');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'JavaScript'});
        });

        it('should generate a typescript test file for a selected instantiated smart contract', async () => {
            workspaceConfigurationGetStub.onCall(0).returns('some command');
            getConfigurationStub = mySandBox.stub(vscode.workspace, 'getConfiguration');
            getConfigurationStub.returns({
                get: workspaceConfigurationGetStub,
                update: workspaceConfigurationUpdateStub
            });
            showLanguageQuickPickStub.resolves({ label: 'TypeScript', type: LanguageType.CONTRACT });
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();
            const testFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.ts`);
            const testFunctionFilePath: string = path.join(testFileDir, 'functionalTests', 'ts-smart-contract-util.ts');
            const testUri: vscode.Uri = vscode.Uri.file(testFilePath);
            const testFunctionUri: vscode.Uri = vscode.Uri.file(testFunctionFilePath);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            openTextDocumentStub.should.have.been.calledWith(testUri.fsPath);
            openTextDocumentStub.should.have.been.calledWith(testFunctionUri.fsPath);
            showTextDocumentStub.should.have.been.calledTwice;
            const templateData: string = mockEditBuilderReplaceSpy.args[1][1];
            templateData.should.not.equal('');
            templateData.includes(smartContractLabel).should.be.true;
            templateData.includes(transactionOne.name).should.be.true;
            templateData.includes(transactionTwo.name).should.be.true;
            templateData.includes(transactionThree.name).should.be.true;
            templateData.startsWith('/*').should.be.true;
            templateData.includes('walletPath').should.be.true;
            templateData.includes('homedir').should.be.false;
            templateData.includes('gateway.connect').should.be.true;
            templateData.includes('submitTransaction').should.be.true;
            templateData.includes(`const args: string[] = [];`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[0].name.replace(`"`, '')}: ${transactionOne.parameters[0].schema.type.replace(`"`, '')} = 'EXAMPLE';`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[1].name.replace(`"`, '')}: ${transactionOne.parameters[1].schema.type.replace(`""`, '')} = 0;`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[2].name.replace(`"`, '')}: any = {};`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[3].name.replace(`"`, '')}: ${transactionOne.parameters[3].schema.type.replace(`"`, '')} = true;`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[4].name.replace(`"`, '')}: any = {};`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[5].name.replace(`"`, '')}: any[] = [];`).should.be.true;
            templateData.includes(`const args: string[] = [ ${transactionOne.parameters[0].name.replace(`"`, '')}, ${transactionOne.parameters[1].name.replace(`"`, '')}.toString(), JSON.stringify(${transactionOne.parameters[2].name.replace(`"`, '')}), ${transactionOne.parameters[3].name.replace(`"`, '')}.toString(), JSON.stringify(${transactionOne.parameters[4].name.replace(`"`, '')}), JSON.stringify(${transactionOne.parameters[5].name.replace(`"`, '')})`).should.be.true;
            templateData.includes('Admin').should.be.true;
            const functionTemplateData: string = mockEditBuilderReplaceSpy.args[0][1];
            functionTemplateData.should.not.equal('');
            functionTemplateData.includes('getConnectionProfile').should.be.true;
            functionTemplateData.includes('submitTransaction').should.be.true;
            functionTemplateData.includes('isLocalhostURL').should.be.true;
            functionTemplateData.includes('hasLocalhostURLs').should.be.true;
            sendCommandStub.should.have.been.calledOnce;
            workspaceConfigurationUpdateStub.should.have.been.calledOnce;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, `Installing package dependencies including: fabric-network@${FABRIC_NETWORK_VERSION}, fabric-client@${FABRIC_CLIENT_VERSION}, @types/mocha, ts-node, typescript`);
            logSpy.getCall(3).should.have.been.calledWith(LogType.INFO, undefined, 'some npm install output');
            logSpy.getCall(4).should.have.been.calledWith(LogType.SUCCESS, 'Successfully generated tests');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'TypeScript'});
        });

        it('should provide a path.join if the wallet path contains the home directory', async () => {
            mySandBox.stub(os, 'homedir').returns('homedir');
            walletRegistryEntry.walletPath = 'homedir/walletPath';

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            const templateData: string = mockEditBuilderReplaceSpy.args[1][1];

            templateData.includes(`path.join(homedir, 'walletPath')`).should.be.true;
        });

        it('should provide a path.join if the connection profile path contains the home directory', async () => {
            mySandBox.stub(os, 'homedir').returns('homedir');
            gatewayRegistryEntry.connectionProfilePath = 'homedir/myPath';

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract as InstantiatedUnknownTreeItem);
            const templateData: string = mockEditBuilderReplaceSpy.args[0][1];

            templateData.includes(`path.join(homedir, 'myPath')`).should.be.true;
        });

        it('should ask the user for an instantiated smart contract to test if none selected', async () => {
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT);
            showInstantiatedSmartContractsQuickPickStub.should.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
        });

        it('should connect if there is no connection', async () => {
            getConnectionStub.onCall(3).returns(null);
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();
            const testFilePath: string = path.join(packageJSONPath.fsPath, '..', 'functionalTests', `my-contract-${smartContractLabel}.test.js`);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT);
            showInstantiatedSmartContractsQuickPickStub.should.have.been.called;
            openTextDocumentStub.should.have.been.called;
            showTextDocumentStub.should.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'JavaScript'});
        });

        it('should handle connecting being cancelled', async () => {
            getConnectionStub.returns(null);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT);
            executeCommandStub.should.have.been.calledWith(ExtensionCommands.CONNECT_TO_GATEWAY);
            showInstantiatedSmartContractsQuickPickStub.should.not.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            should.not.exist(logSpy.getCall(1));
        });

        it('should do nothing if the user cancels selecting an instantiated smart contract', async () => {
            showInstantiatedSmartContractsQuickPickStub.resolves();

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT);
            showInstantiatedSmartContractsQuickPickStub.should.have.been.called;
            showLanguageQuickPickStub.should.not.have.been.called;
            logSpy.should.not.have.been.calledWith(LogType.ERROR);
        });

        it('should handle getting empty metadata', async () => {
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();
            fabricClientConnectionMock.getMetadata.resolves(
                {
                    contracts: {
                        'my-contract': {
                            name: 'my-contract',
                            transactions: [],
                        }
                    }
                }
            );

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT);
            showInstantiatedSmartContractsQuickPickStub.should.have.been.called;
            fabricClientConnectionMock.getMetadata.should.have.been.called;
            logSpy.should.have.been.calledThrice;
            logSpy.should.have.been.calledWith(LogType.ERROR, `No metadata returned. Please ensure this smart contract is developed using the programming model delivered in Hyperledger Fabric v1.4+ for Java, JavaScript and TypeScript`);
            logSpy.should.have.been.calledWith(LogType.ERROR, `Populated metadata required for generating smart contract tests, see previous error`);
            showLanguageQuickPickStub.should.not.have.been.called;
        });

        it('should generate test files for smart contracts with no namespace defined', async () => {
            workspaceConfigurationGetStub.onCall(0).returns('some command');
            getConfigurationStub = mySandBox.stub(vscode.workspace, 'getConfiguration');
            getConfigurationStub.returns({
                get: workspaceConfigurationGetStub,
                update: workspaceConfigurationUpdateStub
            });
            showLanguageQuickPickStub.resolves({ label: 'TypeScript', type: LanguageType.CONTRACT });
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();
            fabricClientConnectionMock.getMetadata.resolves(
                {
                    contracts: {
                        '': {
                            name: '',
                            transactions: [
                                {
                                    name: 'instantiate',
                                },
                                {
                                    name: 'wagonwheeling',
                                    parameters: []
                                },
                                {
                                    name: 'transaction2'
                                }
                            ]
                        }
                    }
                }
            );
            const testFilePath: string = path.join(testFileDir, 'functionalTests', `${smartContractLabel}.test.ts`);
            const testFunctionFilePath: string = path.join(testFileDir, 'functionalTests', 'ts-smart-contract-util.ts');
            const testUri: vscode.Uri = vscode.Uri.file(testFilePath);
            const testFunctionUri: vscode.Uri = vscode.Uri.file(testFunctionFilePath);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT);
            openTextDocumentStub.should.have.been.calledWith(testUri.fsPath);
            openTextDocumentStub.should.have.been.calledWith(testFunctionUri.fsPath);
            showTextDocumentStub.should.have.been.calledTwice;
            const templateData: string = mockEditBuilderReplaceSpy.args[1][1];
            templateData.should.not.equal('');
            templateData.includes(smartContractLabel).should.be.true;
            templateData.includes('instantiate').should.be.true;
            templateData.includes('wagonwheeling').should.be.true;
            templateData.includes('transaction2').should.be.true;
            templateData.startsWith('/*').should.be.true;
            templateData.includes('gateway.connect').should.be.true;
            templateData.includes('submitTransaction').should.be.true;
            templateData.includes(`const args: string[] = [];`).should.be.true;
            const functionTemplateData: string = mockEditBuilderReplaceSpy.args[0][1];
            functionTemplateData.should.not.equal('');
            functionTemplateData.includes('getConnectionProfile').should.be.true;
            functionTemplateData.includes('submitTransaction').should.be.true;
            functionTemplateData.includes('isLocalhostURL').should.be.true;
            functionTemplateData.includes('hasLocalhostURLs').should.be.true;
            sendCommandStub.should.have.been.calledOnce;
            workspaceConfigurationUpdateStub.should.have.been.calledOnce;
            writeJsonStub.should.have.been.calledWith(path.join(testFileDir, 'tsconfig.json'), tsConfigContents, tsConfigFormat);
            logSpy.should.not.have.been.calledWith(LogType.ERROR);
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'TypeScript'});
        });

        it('should show an error message if the user has no workspaces open', async () => {
            workspaceFoldersStub.returns([]);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Smart contract project ${smartContractName} is not open in workspace`);
        });

        it('should do nothing if user cancels selecting a test language', async () => {
            showLanguageQuickPickStub.resolves(undefined);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract as InstantiatedUnknownTreeItem);
            logSpy.should.have.been.calledOnceWith(LogType.INFO, undefined, `testSmartContractCommand`);
            workspaceFoldersStub.should.not.have.been.called;
        });

        it('should show an error message if the smart contract project isnt open in the workspace', async () => {
            const incorrectBuffer: Buffer = Buffer.from(`{"name": "double_decker"}`);
            readFileStub.resolves(incorrectBuffer);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Smart contract project ${smartContractName} is not open in workspace. Please ensure the ${smartContractName} smart contract project folder is not nested within your workspace.`);
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should generate a test file for a smart contract that has a scoped name', async () => {
            const testFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.js`);
            const packageBuffer: Buffer = Buffer.from(`{"name": "@removeThis/wagonwheel"}`);
            readFileStub.resolves(packageBuffer);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, `Installing package dependencies including: fabric-network@${FABRIC_NETWORK_VERSION}, fabric-client@${FABRIC_CLIENT_VERSION}`);
            logSpy.getCall(3).should.have.been.calledWith(LogType.INFO, undefined, 'some npm install output');
            logSpy.getCall(4).should.have.been.calledWith(LogType.SUCCESS, 'Successfully generated tests');
            logSpy.should.not.have.been.calledWith(LogType.ERROR, `Smart contract project ${smartContractName} is not open in workspace. Please ensure the ${smartContractName} smart contract project folder is not nested within your workspace.`);
            sendTelemetryEventStub.should.have.been.called;
        });

        it('should generate a test file for each smart contract defined in the metadata (from tree)', async () => {
            const firstTestFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.js`);
            const firstTestUri: vscode.Uri = vscode.Uri.file(firstTestFilePath);
            const secondTestFilePath: string = path.join(testFileDir, 'functionalTests', `my-other-contract-${smartContractLabel}.test.js`);
            const secondTestUri: vscode.Uri = vscode.Uri.file(secondTestFilePath);
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();

            fabricClientConnectionMock.getMetadata.resolves(moreFakeMetadata);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_ALL_SMART_CONTRACT, instantiatedSmartContract);
            openTextDocumentStub.should.have.been.calledWith(firstTestUri.fsPath);
            openTextDocumentStub.should.have.been.calledWith(secondTestUri.fsPath);
            showTextDocumentStub.callCount.should.equal(4);
            sendCommandStub.should.have.been.calledOnce;
            logSpy.should.not.have.been.calledWith(LogType.ERROR);

            const firstTemplateData: string = mockEditBuilderReplaceSpy.args[1][1];
            firstTemplateData.includes('my-contract').should.be.true;
            firstTemplateData.includes(smartContractLabel).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[1].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].parameters[0].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].parameters[1].name).should.be.true;
            firstTemplateData.includes(`const args = [];`).should.be.true;

            const secondTemplateData: string = mockEditBuilderReplaceSpy.args[3][1];
            secondTemplateData.includes('my-other-contract').should.be.true;
            secondTemplateData.includes(smartContractLabel).should.be.true;
            secondTemplateData.includes(moreFakeMetadata.contracts['my-other-contract'].transactions[0].name).should.be.true;
            secondTemplateData.includes(moreFakeMetadata.contracts['my-other-contract'].transactions[1].name).should.be.true;
            secondTemplateData.includes(moreFakeMetadata.contracts['my-other-contract'].transactions[0].parameters[0].name).should.be.true;
            secondTemplateData.includes(`const args = [];`).should.be.true;

            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'JavaScript'});
        });

        it('should generate a test file for just the contract tree item passed in', async () => {
            const firstTestFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.js`);
            const firstTestUri: vscode.Uri = vscode.Uri.file(firstTestFilePath);
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();

            fabricClientConnectionMock.getMetadata.resolves(moreFakeMetadata);

            allChildren = await blockchainGatewayExplorerProvider.getChildren();
            const channelChildren: Array<ChannelTreeItem> = await blockchainGatewayExplorerProvider.getChildren(allChildren[2]) as Array<ChannelTreeItem>;
            const instantiatedUnknownChainCodes: Array<InstantiatedUnknownTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelChildren[0]) as Array<InstantiatedUnknownTreeItem>;
            await blockchainGatewayExplorerProvider.getChildren(instantiatedUnknownChainCodes[0]);

            const instantiatedTreeItems: Array<InstantiatedContractTreeItem> = await blockchainGatewayExplorerProvider.getChildren(channelChildren[0]) as Array<InstantiatedContractTreeItem>;
            const contractTreeItems: Array<ContractTreeItem> = await blockchainGatewayExplorerProvider.getChildren(instantiatedTreeItems[0]) as Array<ContractTreeItem>;

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, contractTreeItems[0]);
            openTextDocumentStub.should.have.been.calledWith(firstTestUri.fsPath);
            showTextDocumentStub.should.have.been.called;
            sendCommandStub.should.have.been.calledOnce;
            logSpy.should.not.have.been.calledWith(LogType.ERROR);

            mockEditBuilderReplaceSpy.args.length.should.equal(2);

            const firstTemplateData: string = mockEditBuilderReplaceSpy.args[1][1];
            firstTemplateData.includes('my-contract').should.be.true;
            firstTemplateData.includes(smartContractLabel).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[1].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].parameters[0].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].parameters[1].name).should.be.true;
            firstTemplateData.includes(`const args = [];`).should.be.true;

            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'JavaScript'});
        });

        it('should generate a test file for just the selected contract', async () => {
            const firstTestFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.js`);
            const firstTestUri: vscode.Uri = vscode.Uri.file(firstTestFilePath);
            const testFunctionFilePath: string = path.join(testFileDir, 'functionalTests', 'js-smart-contract-util.js');
            const testFunctionUri: vscode.Uri = vscode.Uri.file(testFunctionFilePath);
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();

            fabricClientConnectionMock.getMetadata.resolves(moreFakeMetadata);

            mySandBox.stub(UserInputUtil, 'showContractQuickPick').resolves('my-contract');

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT);
            openTextDocumentStub.should.have.been.calledWith(firstTestUri.fsPath);
            openTextDocumentStub.should.have.been.calledWith(testFunctionUri.fsPath);

            showTextDocumentStub.should.have.been.calledTwice;
            sendCommandStub.should.have.been.calledOnce;
            logSpy.should.not.have.been.calledWith(LogType.ERROR);

            mockEditBuilderReplaceSpy.args.length.should.equal(2);

            const firstTemplateData: string = mockEditBuilderReplaceSpy.args[1][1];
            firstTemplateData.includes('my-contract').should.be.true;
            firstTemplateData.includes(smartContractLabel).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[1].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].parameters[0].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].parameters[1].name).should.be.true;
            firstTemplateData.includes(`const args = [];`).should.be.true;

            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'JavaScript'});
        });

        it('should generate a test file for all contracts', async () => {
            const firstTestFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.js`);
            const firstTestUri: vscode.Uri = vscode.Uri.file(firstTestFilePath);
            const secondTestFilePath: string = path.join(testFileDir, 'functionalTests', `my-other-contract-${smartContractLabel}.test.js`);
            const secondTestUri: vscode.Uri = vscode.Uri.file(secondTestFilePath);
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();

            fabricClientConnectionMock.getMetadata.resolves(moreFakeMetadata);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_ALL_SMART_CONTRACT);
            openTextDocumentStub.should.have.been.calledWith(firstTestUri.fsPath);
            openTextDocumentStub.should.have.been.calledWith(secondTestUri.fsPath);
            showTextDocumentStub.callCount.should.equal(4);
            sendCommandStub.should.have.been.calledOnce;
            logSpy.should.not.have.been.calledWith(LogType.ERROR);

            const firstTemplateData: string = mockEditBuilderReplaceSpy.args[1][1];
            firstTemplateData.includes('my-contract').should.be.true;
            firstTemplateData.includes(smartContractLabel).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[1].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].parameters[0].name).should.be.true;
            firstTemplateData.includes(moreFakeMetadata.contracts['my-contract'].transactions[0].parameters[1].name).should.be.true;
            firstTemplateData.includes(`const args = [];`).should.be.true;

            const secondTemplateData: string = mockEditBuilderReplaceSpy.args[3][1];
            secondTemplateData.includes('my-other-contract').should.be.true;
            secondTemplateData.includes(smartContractLabel).should.be.true;
            secondTemplateData.includes(moreFakeMetadata.contracts['my-other-contract'].transactions[0].name).should.be.true;
            secondTemplateData.includes(moreFakeMetadata.contracts['my-other-contract'].transactions[1].name).should.be.true;
            secondTemplateData.includes(moreFakeMetadata.contracts['my-other-contract'].transactions[0].parameters[0].name).should.be.true;
            secondTemplateData.includes(`const args = [];`).should.be.true;

            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'JavaScript'});
        });

        it('should only create the test util file once if generating multiple test files', async () => {
            const firstTestFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.js`);
            const firstTestUri: vscode.Uri = vscode.Uri.file(firstTestFilePath);
            const secondTestFilePath: string = path.join(testFileDir, 'functionalTests', `my-other-contract-${smartContractLabel}.test.js`);
            const secondTestUri: vscode.Uri = vscode.Uri.file(secondTestFilePath);
            const testUtilPath: string = path.join(packageJSONPath.fsPath, '..', 'functionalTests', `js-smart-contract-util.js`);
            const testUtilUri: vscode.Uri = vscode.Uri.file(testUtilPath);

            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists');
            pathExistsStub.resolves(false);
            pathExistsStub.onCall(3).resolves(true);

            fabricClientConnectionMock.getMetadata.resolves(moreFakeMetadata);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_ALL_SMART_CONTRACT);
            openTextDocumentStub.getCall(0).should.have.been.calledWith(testUtilUri.fsPath);
            openTextDocumentStub.getCall(1).should.have.been.calledWith(firstTestUri.fsPath);
            openTextDocumentStub.getCall(2).should.have.been.calledWith(secondTestUri.fsPath);

            showTextDocumentStub.callCount.should.equal(3);
        });

        it('should handle cancel from choosing contract', async () => {
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();

            fabricClientConnectionMock.getMetadata.resolves(moreFakeMetadata);

            mySandBox.stub(UserInputUtil, 'showContractQuickPick').resolves();

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT);
            openTextDocumentStub.should.not.have.been.called;
            sendCommandStub.should.not.have.been.called;
            logSpy.should.not.have.been.calledWith(LogType.ERROR);
        });

        it('should handle errors with creating the template data', async () => {
            const error: Error = new Error('some error');

            mySandBox.stub(ejs, 'renderFile').yields(error, null);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            mySandBox.stub(fs, 'pathExists').should.not.have.been.called;

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Error creating template data: ${error.message}`, `Error creating template data: ${error.toString()}`);
        });

        it('should not overwrite an existing test file if the user says no', async () => {
            const testFilePath: string = path.join(packageJSONPath.fsPath, '..', 'functionalTests', `my-contract-${smartContractLabel}.test.js`);

            mySandBox.stub(fs, 'pathExists').resolves(true);
            const showTestFileOverwriteQuickPickStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'showTestFileOverwriteQuickPick').resolves(UserInputUtil.NO);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            showTestFileOverwriteQuickPickStub.should.have.been.called;
            mySandBox.stub(fs, 'ensureFile').should.not.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Preserving test file for instantiated smart contract located here: ${testFilePath}`);
        });

        it('should not overwrite an existing test file if the user cancels the overwrite quick pick box', async () => {
            const testFilePath: string = path.join(packageJSONPath.fsPath, '..', 'functionalTests', `my-contract-${smartContractLabel}.test.js`);

            mySandBox.stub(fs, 'pathExists').resolves(true);
            const showTestFileOverwriteQuickPickStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'showTestFileOverwriteQuickPick').resolves(undefined);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            showTestFileOverwriteQuickPickStub.should.have.been.called;
            mySandBox.stub(fs, 'ensureFile').should.not.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Preserving test file for instantiated smart contract located here: ${testFilePath}`);
        });

        it('should overwrite an existing test file if the user says yes', async () => {
            const testFilePath: string = path.join(packageJSONPath.fsPath, '..', 'functionalTests', `my-contract-${smartContractLabel}.test.js`);

            mySandBox.stub(fs, 'pathExists').resolves(true);
            const showTestFileOverwriteQuickPickStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'showTestFileOverwriteQuickPick').resolves(UserInputUtil.YES);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract as InstantiatedUnknownTreeItem);
            showTestFileOverwriteQuickPickStub.should.have.been.called;
            openTextDocumentStub.should.have.been.called;
            showTextDocumentStub.should.have.been.called;
            const templateData: string = mockEditBuilderReplaceSpy.args[1][1];
            templateData.should.not.equal('');
            templateData.includes(smartContractLabel).should.be.true;
            templateData.includes(transactionOne.name).should.be.true;
            templateData.includes(transactionTwo.name).should.be.true;
            templateData.includes(transactionThree.name).should.be.true;
            templateData.startsWith('/*').should.be.true;
            templateData.includes('gateway.connect').should.be.true;
            templateData.includes('submitTransaction').should.be.true;
            templateData.includes(`const args = [];`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[0].name.replace(`"`, '')} = 'EXAMPLE';`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[1].name.replace(`"`, '')} = 0;`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[2].name.replace(`"`, '')} = {};`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[3].name.replace(`"`, '')} = true;`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[4].name.replace(`"`, '')} = {};`).should.be.true;
            templateData.includes(`const args = [ ${transactionOne.parameters[0].name.replace(`"`, '')}, ${transactionOne.parameters[1].name.replace(`"`, '')}.toString(), JSON.stringify(${transactionOne.parameters[2].name.replace(`"`, '')}), ${transactionOne.parameters[3].name.replace(`"`, '')}.toString(), JSON.stringify(${transactionOne.parameters[4].name.replace(`"`, '')})`).should.be.true;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, `Installing package dependencies including: fabric-network@${FABRIC_NETWORK_VERSION}, fabric-client@${FABRIC_CLIENT_VERSION}`);
            logSpy.getCall(3).should.have.been.calledWith(LogType.INFO, undefined, 'some npm install output');
            logSpy.getCall(4).should.have.been.calledWith(LogType.SUCCESS, 'Successfully generated tests');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'JavaScript'});
        });

        it('should overwrite the test util if the user chooses to overwrite the test file', async () => {
            mySandBox.stub(fs, 'pathExists').resolves(true);
            const showTestFileOverwriteQuickPickStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'showTestFileOverwriteQuickPick').resolves(UserInputUtil.YES);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            showTestFileOverwriteQuickPickStub.should.have.been.called;
            openTextDocumentStub.should.have.been.calledTwice;
            showTextDocumentStub.should.have.been.calledTwice;
            const templateData: string = mockEditBuilderReplaceSpy.args[0][1];

            templateData.includes('isLocalhostURL').should.be.true;
        });

        it('should not overwrite the test util if test util already exists and the user is not overwriting tests', async () => {
            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists');
            const testFilePath: string = path.join(packageJSONPath.fsPath, '..', 'functionalTests', `my-contract-${smartContractLabel}.test.js`);

            pathExistsStub.onCall(0).resolves(false);
            pathExistsStub.onCall(1).resolves(true);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);

            const templateData: string = mockEditBuilderReplaceSpy.args[0][1];

            templateData.should.not.equal('');
            templateData.includes(smartContractLabel).should.be.true;
            templateData.includes(transactionOne.name).should.be.true;
            templateData.includes(transactionTwo.name).should.be.true;
            templateData.includes(transactionThree.name).should.be.true;
            templateData.startsWith('/*').should.be.true;
            templateData.includes('gateway.connect').should.be.true;
            templateData.includes('submitTransaction').should.be.true;
            templateData.includes(`const args = [];`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[0].name.replace(`"`, '')} = 'EXAMPLE';`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[1].name.replace(`"`, '')} = 0;`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[2].name.replace(`"`, '')} = {};`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[3].name.replace(`"`, '')} = true;`).should.be.true;
            templateData.includes(`const ${transactionOne.parameters[4].name.replace(`"`, '')} = {};`).should.be.true;
            templateData.includes(`const args = [ ${transactionOne.parameters[0].name.replace(`"`, '')}, ${transactionOne.parameters[1].name.replace(`"`, '')}.toString(), JSON.stringify(${transactionOne.parameters[2].name.replace(`"`, '')}), ${transactionOne.parameters[3].name.replace(`"`, '')}.toString(), JSON.stringify(${transactionOne.parameters[4].name.replace(`"`, '')})`).should.be.true;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, `Installing package dependencies including: fabric-network@${FABRIC_NETWORK_VERSION}, fabric-client@${FABRIC_CLIENT_VERSION}`);
            logSpy.getCall(3).should.have.been.calledWith(LogType.INFO, undefined, 'some npm install output');
            logSpy.getCall(4).should.have.been.calledWith(LogType.SUCCESS, 'Successfully generated tests');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'JavaScript'});
        });

        it('should generate a copy of the test file if the user tells it to', async () => {
            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists');
            pathExistsStub.onCall(0).resolves(true);
            pathExistsStub.onCall(1).resolves(true);
            pathExistsStub.callThrough();
            const showTestFileOverwriteQuickPickStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'showTestFileOverwriteQuickPick').resolves(UserInputUtil.GENERATE_NEW_TEST_FILE);
            const testFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}-copy1.test.js`);
            const testUri: vscode.Uri = vscode.Uri.file(testFilePath);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract as InstantiatedUnknownTreeItem);
            showTestFileOverwriteQuickPickStub.should.have.been.called;
            openTextDocumentStub.should.have.been.calledWith(testUri.fsPath);
            showTextDocumentStub.should.have.been.called;
            const templateData: string = mockEditBuilderReplaceSpy.args[1][1];
            templateData.should.not.equal('');
            templateData.includes(smartContractName).should.be.true;
            templateData.includes(transactionOne.name).should.be.true;
            templateData.includes(transactionTwo.name).should.be.true;
            templateData.includes(transactionThree.name).should.be.true;
            logSpy.should.not.have.been.calledWith(LogType.ERROR);
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'JavaScript'});
        });

        it('should generate a copy of the test file and name it correctly if the smart contract namespace isnt defined', async () => {
            fabricClientConnectionMock.getMetadata.resolves(
                {
                    contracts: {
                        '': {
                            name: '',
                            transactions: [
                                {
                                    name: 'instantiate'
                                },
                                {
                                    name: 'wagonwheeling',
                                    parameters: []
                                },
                                {
                                    name: 'transaction2'
                                }
                            ]
                        }
                    }
                }
            );
            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists');
            pathExistsStub.onCall(0).resolves(true);
            pathExistsStub.onCall(1).resolves(true);
            pathExistsStub.callThrough();
            const showTestFileOverwriteQuickPickStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'showTestFileOverwriteQuickPick').resolves(UserInputUtil.GENERATE_NEW_TEST_FILE);
            const testFilePath: string = path.join(testFileDir, 'functionalTests', `${smartContractLabel}-copy1.test.js`);
            const testUri: vscode.Uri = vscode.Uri.file(testFilePath);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            showTestFileOverwriteQuickPickStub.should.have.been.called;
            openTextDocumentStub.should.have.been.calledWith(testUri.fsPath);
            showTextDocumentStub.should.have.been.called;
            const templateData: string = mockEditBuilderReplaceSpy.args[1][1];
            templateData.should.not.equal('');
            templateData.includes(smartContractName).should.be.true;
            templateData.includes('instantiate').should.be.true;
            templateData.includes('wagonwheeling').should.be.true;
            templateData.includes('transaction2').should.be.true;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, `Installing package dependencies including: fabric-network@${FABRIC_NETWORK_VERSION}, fabric-client@${FABRIC_CLIENT_VERSION}`);
            logSpy.getCall(3).should.have.been.calledWith(LogType.INFO, undefined, 'some npm install output');
            logSpy.getCall(4).should.have.been.calledWith(LogType.SUCCESS, 'Successfully generated tests');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'JavaScript'});
        });

        it('should show an error if it fails to create test file', async () => {
            const error: Error = new Error('some error');
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').rejects(error);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            openTextDocumentStub.should.not.have.been.called;

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Error creating test file: ${error.message}`, `Error creating test file: ${error.toString()}`);
            fsRemoveStub.should.have.been.called;
        });

        it('should show an error if it fails to create the util file', async () => {
            const testFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.js`);
            const error: Error = new Error('some error');
            const ensureFileStub: sinon.SinonStub = mySandBox.stub(fs, 'ensureFile');
            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists');

            pathExistsStub.resolves(false);

            ensureFileStub.onCall(0).resolves();
            ensureFileStub.onCall(1).rejects(error);

            mockTextEditor.edit.resolves(false);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract as InstantiatedUnknownTreeItem);
            openTextDocumentStub.should.not.have.been.called;

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.ERROR, `Error creating test util file: ${error.message}`, `Error creating test util file: ${error.toString()}`);
            fsRemoveStub.should.have.been.called;
        });

        it('should handle errors writing data to the util file', async () => {
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();
            const testFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.js`);
            const testUtilFilePath: string = path.join(testFileDir, 'functionalTests', `js-smart-contract-util.js`);

            mockTextEditor.edit.resolves(false);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            openTextDocumentStub.should.have.been.called;
            showTextDocumentStub.should.have.been.called;
            mockDocumentSaveSpy.should.not.have.been.called;

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.ERROR, `Error editing test util file: ${testUtilFilePath}`);
            fsRemoveStub.should.have.been.called;
        });

        it('should handle errors writing data to the test file', async () => {
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();

            const testFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.js`);

            mockTextEditor.edit.onCall(1).resolves(false);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            openTextDocumentStub.should.have.been.called;
            showTextDocumentStub.should.have.been.called;
            mockDocumentSaveSpy.should.have.been.calledOnce;

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.ERROR, `Error editing test file: ${testFilePath}`);
            fsRemoveStub.should.have.been.called;
        });

        it('should handle errors when attempting to remove created test file', async () => {
            const fsError: Error = new Error('some other error');
            const ensureError: Error = new Error('ensure error');
            mySandBox.stub(fs, 'ensureFile').rejects(ensureError);
            fsRemoveStub.rejects(fsError);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            mySandBox.stub(fs, 'pathExists').should.not.have.been.called;

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Error creating test file: ${ensureError.message}`, `Error creating test file: ${ensureError.toString()}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.ERROR, `Error removing test file: ${fsError.message}`, `Error removing test file: ${fsError.toString()}`);
            fsRemoveStub.should.have.been.called;
            openTextDocumentStub.should.not.have.been.called;
        });

        it('should not show error for removing non-existent test file', async () => {
            mockTextEditor.edit.resolves(false);
            fsRemoveStub.rejects({ message: 'ENOENT: no such file or directory' });
            const testFilePath: string = path.join(testFileDir, 'functionalTests', `my-contract-${smartContractLabel}.test.js`);
            const testFunctionFilePath: string = path.join(testFileDir, 'functionalTests', `js-smart-contract-util.js`);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract as InstantiatedUnknownTreeItem);
            mySandBox.stub(fs, 'pathExists').should.not.have.been.called;

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.ERROR, `Error editing test util file: ${testFunctionFilePath}`);

            fsRemoveStub.should.have.been.called;
        });

        it('should show an error if the npm install fails', async () => {
            const testFilePath: string = path.join(packageJSONPath.fsPath, '..', 'functionalTests', `my-contract-${smartContractLabel}.test.js`);

            const error: Error = new Error('horrible error');
            sendCommandStub.onCall(0).rejects(error);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            sendCommandStub.should.have.been.calledOnce;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, `Installing package dependencies including: fabric-network@${FABRIC_NETWORK_VERSION}, fabric-client@${FABRIC_CLIENT_VERSION}`);
            logSpy.getCall(3).should.have.been.calledWith(LogType.ERROR, `Error installing node modules in smart contract project: ${error.message}`, `Error installing node modules in smart contract project: ${error.toString()}`);
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should correctly detect existing test runner user settings for typescript tests', async () => {
            const testFilePath: string = path.join(packageJSONPath.fsPath, '..', 'functionalTests', `my-contract-${smartContractLabel}.test.ts`);

            workspaceConfigurationGetStub.onCall(0).returns('-r ts-node/register');
            getConfigurationStub = mySandBox.stub(vscode.workspace, 'getConfiguration');
            getConfigurationStub.returns({
                get: workspaceConfigurationGetStub,
                update: workspaceConfigurationUpdateStub
            });

            showLanguageQuickPickStub.resolves({ label: 'TypeScript', type: LanguageType.CONTRACT });
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            workspaceConfigurationUpdateStub.should.not.have.been.called;
            writeJsonStub.should.have.been.calledWith(path.join(testFileDir, 'tsconfig.json'), tsConfigContents, tsConfigFormat);
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, `Installing package dependencies including: fabric-network@${FABRIC_NETWORK_VERSION}, fabric-client@${FABRIC_CLIENT_VERSION}, @types/mocha, ts-node, typescript`);
            logSpy.getCall(3).should.have.been.calledWith(LogType.INFO, undefined, 'some npm install output');
            logSpy.getCall(4).should.have.been.calledWith(LogType.SUCCESS, 'Successfully generated tests');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'TypeScript'});
        });

        it('should correctly detect no test runner user settings for typescript tests', async () => {
            const testFilePath: string = path.join(packageJSONPath.fsPath, '..', 'functionalTests', `my-contract-${smartContractLabel}.test.ts`);

            workspaceConfigurationGetStub.onCall(0).returns(undefined);
            getConfigurationStub = mySandBox.stub(vscode.workspace, 'getConfiguration');
            getConfigurationStub.returns({
                get: workspaceConfigurationGetStub,
                update: workspaceConfigurationUpdateStub
            });
            showLanguageQuickPickStub.resolves({ label: 'TypeScript', type: LanguageType.CONTRACT });
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            workspaceConfigurationUpdateStub.should.have.been.called;
            writeJsonStub.should.have.been.calledWith(path.join(testFileDir, 'tsconfig.json'), tsConfigContents, tsConfigFormat);
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, `Installing package dependencies including: fabric-network@${FABRIC_NETWORK_VERSION}, fabric-client@${FABRIC_CLIENT_VERSION}, @types/mocha, ts-node, typescript`);
            logSpy.getCall(3).should.have.been.calledWith(LogType.INFO, undefined, 'some npm install output');
            logSpy.getCall(4).should.have.been.calledWith(LogType.SUCCESS, 'Successfully generated tests');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('testSmartContractCommand', {testSmartContractLanguage: 'TypeScript'});
        });

        it('should error if tsconfig.json file cannot be created', async () => {
            const testFilePath: string = path.join(packageJSONPath.fsPath, '..', 'functionalTests', `my-contract-${smartContractLabel}.test.ts`);

            workspaceConfigurationGetStub.onCall(0).returns(undefined);
            getConfigurationStub = mySandBox.stub(vscode.workspace, 'getConfiguration');
            getConfigurationStub.returns({
                get: workspaceConfigurationGetStub,
                update: workspaceConfigurationUpdateStub
            });
            showLanguageQuickPickStub.resolves({ label: 'TypeScript', type: LanguageType.CONTRACT });
            mySandBox.stub(fs, 'pathExists').resolves(false);
            mySandBox.stub(fs, 'ensureFile').resolves();

            const error: Error = new Error('failed for some reason');
            writeJsonStub.throws(error);

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            workspaceConfigurationUpdateStub.should.have.been.called;

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, `Installing package dependencies including: fabric-network@${FABRIC_NETWORK_VERSION}, fabric-client@${FABRIC_CLIENT_VERSION}, @types/mocha, ts-node, typescript`);
            logSpy.getCall(3).should.have.been.calledWith(LogType.INFO, undefined, 'some npm install output');
            logSpy.getCall(4).should.have.been.calledWith(LogType.ERROR, 'Unable to create tsconfig.json file: failed for some reason', `Unable to create tsconfig.json file: ${error.toString()}`);
        });

        it('should warn the user if tsconfig.json file already exists', async () => {
            const testFilePath: string = path.join(packageJSONPath.fsPath, '..', 'functionalTests', `my-contract-${smartContractLabel}.test.ts`);

            workspaceConfigurationGetStub.onCall(0).returns(undefined);
            getConfigurationStub = mySandBox.stub(vscode.workspace, 'getConfiguration');
            getConfigurationStub.returns({
                get: workspaceConfigurationGetStub,
                update: workspaceConfigurationUpdateStub
            });
            showLanguageQuickPickStub.resolves({ label: 'TypeScript', type: LanguageType.CONTRACT });
            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists');
            pathExistsStub.onFirstCall().resolves(false);
            pathExistsStub.onSecondCall().resolves(false);
            pathExistsStub.onThirdCall().resolves(true);
            mySandBox.stub(fs, 'ensureFile').resolves();

            await vscode.commands.executeCommand(ExtensionCommands.TEST_SMART_CONTRACT, instantiatedSmartContract);
            workspaceConfigurationUpdateStub.should.have.been.called;
            writeJsonStub.should.not.have.been.called;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, `testSmartContractCommand`);
            logSpy.getCall(1).should.have.been.calledWith(LogType.INFO, undefined, `Writing to Smart Contract test file: ${testFilePath}`);
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, `Installing package dependencies including: fabric-network@${FABRIC_NETWORK_VERSION}, fabric-client@${FABRIC_CLIENT_VERSION}, @types/mocha, ts-node, typescript`);
            logSpy.getCall(3).should.have.been.calledWith(LogType.INFO, undefined, 'some npm install output');
            logSpy.getCall(4).should.have.been.calledWith(LogType.WARNING, 'Unable to create tsconfig.json file as it already exists');
            logSpy.getCall(5).should.have.been.calledWith(LogType.SUCCESS, 'Successfully generated tests');
        });
    });
});

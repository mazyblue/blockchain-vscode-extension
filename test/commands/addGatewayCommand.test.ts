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
import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { TestUtil } from '../TestUtil';
import { UserInputUtil } from '../../src/commands/UserInputUtil';
import { FabricGatewayHelper } from '../../src/fabric/FabricGatewayHelper';
import { VSCodeBlockchainOutputAdapter } from '../../src/logging/VSCodeBlockchainOutputAdapter';
import { LogType } from '../../src/logging/OutputAdapter';
import { ExtensionCommands } from '../../ExtensionCommands';
import { FabricGatewayRegistry } from '../../src/fabric/FabricGatewayRegistry';
import { Reporter } from '../../src/util/Reporter';
import { SettingConfigurations } from '../../SettingConfigurations';
import { FabricNode } from '../../src/fabric/FabricNode';
import { FabricEnvironmentRegistryEntry } from '../../src/fabric/FabricEnvironmentRegistryEntry';

// tslint:disable no-unused-expression
chai.should();
chai.use(sinonChai);

describe('AddGatewayCommand', () => {
    const rootPath: string = path.dirname(__dirname);
    const mySandBox: sinon.SinonSandbox = sinon.createSandbox();

    let showInputBoxStub: sinon.SinonStub;
    let methodChooserStub: sinon.SinonStub;
    let browseStub: sinon.SinonStub;
    let copyConnectionProfileStub: sinon.SinonStub;
    let executeCommandSpy: sinon.SinonSpy;
    let sendTelemetryEventStub: sinon.SinonStub;
    let logSpy: sinon.SinonSpy;

    before(async () => {
        await TestUtil.setupTests(mySandBox);
        await TestUtil.storeGatewaysConfig();
    });

    after(async () => {
        await TestUtil.restoreGatewaysConfig();
    });

    beforeEach(() => {
        logSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
        showInputBoxStub = mySandBox.stub(vscode.window, 'showInputBox');
        executeCommandSpy = mySandBox.spy(vscode.commands, 'executeCommand');
        sendTelemetryEventStub = mySandBox.stub(Reporter.instance(), 'sendTelemetryEvent');

        methodChooserStub = mySandBox.stub(UserInputUtil, 'showQuickPick').resolves(UserInputUtil.ADD_GATEWAY_FRPM_CCP);

    });

    afterEach(() => {
        mySandBox.restore();
    });

    describe('addGateway with connection profile', () => {

        beforeEach(async () => {
            // reset the available gateways
            await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_GATEWAYS, [], vscode.ConfigurationTarget.Global);

            browseStub = mySandBox.stub(UserInputUtil, 'browse');
            copyConnectionProfileStub = mySandBox.stub(FabricGatewayHelper, 'copyConnectionProfile');
            copyConnectionProfileStub.onFirstCall().resolves(path.join('blockchain', 'extension', 'directory', 'gatewayOne', 'connection.json'));
            copyConnectionProfileStub.onSecondCall().resolves(path.join('blockchain', 'extension', 'directory', 'gatewayTwo', 'connection.json'));
        });

        afterEach(async () => {
            mySandBox.restore();
        });

        it('should test a gateway can be added', async () => {
            showInputBoxStub.onFirstCall().resolves('myGateway');
            browseStub.onFirstCall().resolves(path.join(rootPath, '../../test/data/connectionOne/connection.json'));

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);

            gateways.length.should.equal(1);
            gateways[0].should.deep.equal({
                name: 'myGateway',
                connectionProfilePath: path.join('blockchain', 'extension', 'directory', 'gatewayOne', 'connection.json'),
                associatedWallet: ''
            });
            executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);
            copyConnectionProfileStub.should.have.been.calledOnce;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new gateway');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('addGatewayCommand');
        });

        it('should test multiple gateways can be added', async () => {
            // Stub first gateway details
            showInputBoxStub.onFirstCall().resolves('myGatewayOne'); // First gateway name
            browseStub.onFirstCall().resolves(path.join(rootPath, '../../test/data/connectionOne/connection.json')); // First gateway connection profile
            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            // Stub second gateway details
            showInputBoxStub.reset();
            showInputBoxStub.onFirstCall().resolves('myGatewayTwo'); // Second gateway name
            browseStub.reset();
            browseStub.onFirstCall().resolves(path.join(rootPath, '../../test/data/connectionTwo/connection.json')); // Second gateway connection profile

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);

            gateways.length.should.equal(2);
            gateways[0].should.deep.equal({
                name: 'myGatewayOne',
                connectionProfilePath: path.join('blockchain', 'extension', 'directory', 'gatewayOne', 'connection.json'),
                associatedWallet: ''
            });

            gateways[1].should.deep.equal({
                name: 'myGatewayTwo',
                connectionProfilePath: path.join('blockchain', 'extension', 'directory', 'gatewayTwo', 'connection.json'),
                associatedWallet: ''
            });

            executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);
            copyConnectionProfileStub.should.have.been.calledTwice;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new gateway');
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.getCall(3).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new gateway');
            sendTelemetryEventStub.should.have.been.calledTwice;
            sendTelemetryEventStub.should.have.been.calledWithExactly('addGatewayCommand');
        });

        it('should test adding a gateway can be cancelled when giving a gateway name', async () => {
            showInputBoxStub.onFirstCall().resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);
            gateways.length.should.equal(0);
            logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'addGateway');
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should test adding a gateway can be cancelled when giving a connection profile', async () => {
            showInputBoxStub.onFirstCall().resolves('myGateway');
            browseStub.onFirstCall().resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            browseStub.should.have.been.calledOnce;
            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);
            gateways.length.should.equal(0);
            logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'addGateway');
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should handle errors when adding a gateway', async () => {
            showInputBoxStub.onFirstCall().resolves('myGateway');
            browseStub.onFirstCall().resolves(path.join(rootPath, '../../test/data/connectionOne/connection.json'));
            mySandBox.stub(FabricGatewayRegistry.instance(), 'add').rejects({ message: 'already exists' });

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);

            gateways.length.should.equal(0);
            logSpy.should.have.been.calledTwice;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.getCall(1).should.have.been.calledWith(LogType.ERROR, `Failed to add a new gateway: already exists`);
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should error if a gateway with the same name already exists', async () => {
            const error: Error = new Error('A gateway with this name already exists.');

            // Stub first gateway details
            showInputBoxStub.resolves('myGatewayOne'); // First gateway name
            browseStub.onFirstCall().resolves(path.join(rootPath, '../../test/data/connectionOne/connection.json')); // First gateway connection profile
            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);

            gateways.length.should.equal(1);
            gateways[0].should.deep.equal({
                name: 'myGatewayOne',
                connectionProfilePath: path.join('blockchain', 'extension', 'directory', 'gatewayOne', 'connection.json'),
                associatedWallet: ''
            });

            executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);
            copyConnectionProfileStub.should.have.been.calledOnce;
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new gateway');
            logSpy.getCall(2).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.getCall(3).should.have.been.calledWith(LogType.ERROR, `Failed to add a new gateway: ${error.message}`, `Failed to add a new gateway: ${error.toString()}`);
            sendTelemetryEventStub.should.have.been.calledOnce;
        });
    });

    describe('add gateway from environment', () => {

        let showEnvironmentQuickPickStub: sinon.SinonStub;
        let showOrgQuickPickStub: sinon.SinonStub;
        let showFabricNodeQuickPickStub: sinon.SinonStub;
        let generateConnectionProfileStub: sinon.SinonStub;
        let peerNode: FabricNode;
        let caNode: FabricNode;

        beforeEach(async () => {

            // reset the available gateways
            await vscode.workspace.getConfiguration().update(SettingConfigurations.FABRIC_GATEWAYS, [], vscode.ConfigurationTarget.Global);

            methodChooserStub.resolves(UserInputUtil.ADD_GATEWAY_FROM_ENVIRONMENT);

            const environmentRegistryEntry: FabricEnvironmentRegistryEntry = new FabricEnvironmentRegistryEntry();
            environmentRegistryEntry.name = 'myEnv';
            showEnvironmentQuickPickStub = mySandBox.stub(UserInputUtil, 'showFabricEnvironmentQuickPickBox').resolves({ label: 'myEnv', data: environmentRegistryEntry });

            peerNode = FabricNode.newPeer('peer0.org1.example.com', 'peer0.org1.example.com', 'grpc://localhost:7051', 'local_fabric_wallet', 'admin', 'Org1MSP');
            showOrgQuickPickStub = mySandBox.stub(UserInputUtil, 'showOrgQuickPick').resolves({ label: 'Org1MSP', data: peerNode });

            caNode = FabricNode.newCertificateAuthority('ca.org1.example.com', 'ca.org1.example.com', 'http://localhost:7054', 'ca_name', 'local_fabric_wallet', 'admin', 'Org1MSP', 'admin', 'adminpw');
            showFabricNodeQuickPickStub = mySandBox.stub(UserInputUtil, 'showFabricNodeQuickPick').resolves({ label: 'ca.org1.example.com', data: caNode });

            generateConnectionProfileStub = mySandBox.stub(FabricGatewayHelper, 'generateConnectionProfile').resolves(path.join('blockchain', 'extension', 'directory', 'gatewayOne', 'connection.json'));

            showInputBoxStub.resolves('myGateway');
        });

        it('should create a gateway from an environment', async () => {

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);

            gateways.length.should.equal(1);
            gateways[0].should.deep.equal({
                name: 'myGateway',
                connectionProfilePath: path.join('blockchain', 'extension', 'directory', 'gatewayOne', 'connection.json'),
                associatedWallet: 'local_fabric_wallet'
            });
            executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);
            generateConnectionProfileStub.should.have.been.calledOnceWith('myGateway', peerNode, caNode);
            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.getCall(1).should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new gateway');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('addGatewayCommand');
        });

        it('should handle cancel of choosing method to add gateway', async () => {
            methodChooserStub.resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);

            gateways.length.should.equal(0);

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.should.not.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new gateway');
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should handle cancel of choosing environment', async () => {
            showEnvironmentQuickPickStub.resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);

            gateways.length.should.equal(0);

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.should.not.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new gateway');
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should handle cancel choosing org', async () => {
            showOrgQuickPickStub.resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);

            gateways.length.should.equal(0);

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.should.not.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new gateway');
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should handle cancel choosing ca', async () => {
            showFabricNodeQuickPickStub.resolves();

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);

            gateways.length.should.equal(0);

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.should.not.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new gateway');
            sendTelemetryEventStub.should.not.have.been.called;
        });

        it('should handle no ca found', async () => {
            showFabricNodeQuickPickStub.rejects('some error');

            await vscode.commands.executeCommand(ExtensionCommands.ADD_GATEWAY);

            const gateways: Array<any> = vscode.workspace.getConfiguration().get(SettingConfigurations.FABRIC_GATEWAYS);

            gateways[0].should.deep.equal({
                name: 'myGateway',
                connectionProfilePath: path.join('blockchain', 'extension', 'directory', 'gatewayOne', 'connection.json'),
                associatedWallet: 'local_fabric_wallet'
            });

            logSpy.getCall(0).should.have.been.calledWith(LogType.INFO, undefined, 'addGateway');
            logSpy.should.have.been.calledWith(LogType.INFO, 'Could not find a certifcate authority to add to the connection profile');

            logSpy.should.have.been.calledWith(LogType.SUCCESS, 'Successfully added a new gateway');
            sendTelemetryEventStub.should.have.been.called;
        });
    });
});

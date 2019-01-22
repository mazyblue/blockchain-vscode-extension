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

import * as vscode from 'vscode';
import { UserInputUtil, IBlockchainQuickPickItem } from './UserInputUtil';
import { RuntimeTreeItem } from '../explorer/model/RuntimeTreeItem';
import { VSCodeOutputAdapter } from '../logging/VSCodeOutputAdapter';
import { FabricRuntime } from '../fabric/FabricRuntime';
import { FabricRuntimeManager } from '../fabric/FabricRuntimeManager';
import { LogType } from '../logging/OutputAdapter';

export async function startFabricRuntime(runtimeToStart?: RuntimeTreeItem | FabricRuntime): Promise<void> {
    const outputAdapter: VSCodeOutputAdapter = VSCodeOutputAdapter.instance();
    outputAdapter.log(LogType.INFO, undefined, 'startFabricRuntime');
    let runtime: FabricRuntime;
    if (!runtimeToStart) {
        const allRuntimes: Array<FabricRuntime> = FabricRuntimeManager.instance().getAll();
        if (allRuntimes.length > 1) {
            const chosenRuntime: IBlockchainQuickPickItem<FabricRuntime> = await UserInputUtil.showRuntimeQuickPickBox('Select the Fabric runtime to start') as IBlockchainQuickPickItem<FabricRuntime>;
            if (!chosenRuntime) {
                return;
            }
            runtime = chosenRuntime.data;
        } else {
            runtime = allRuntimes[0];
        }
    } else if (runtimeToStart instanceof RuntimeTreeItem) {
        runtime = runtimeToStart.getRuntime();
    } else {
        runtime = runtimeToStart;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'IBM Blockchain Platform Extension',
        cancellable: false
    }, async (progress: vscode.Progress<{message: string}>) => {
        progress.report({ message: `Starting Fabric runtime ${runtime.getName()}` });
        await runtime.start(outputAdapter);
    });
}

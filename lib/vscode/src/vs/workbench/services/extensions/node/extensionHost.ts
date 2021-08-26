/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, fork, ForkOptions, SendHandle } from 'child_process';
import { IRemoteConsoleLog, isRemoteConsoleLog, log } from 'vs/base/common/console';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { deepClone } from 'vs/base/common/objects';
import { isMacintosh } from 'vs/base/common/platform';
import { IExtHostMessage, IExtHostReadyMessage } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { IIPCOptions } from '../../../../base/parts/ipc/node/ipc.cp';

export type ExtensionHostMessage = IRemoteConsoleLog | IExtHostReadyMessage;

/**
 * Creates an extension host child process with a standard disposable interface.
 */
export class ExtensionHost implements IDisposable {
	private child: ChildProcess | null = null;
	private readonly _onDidProcessExit = new Emitter<{ code: number; signal: string }>();
	public readonly onDidProcessExit = this._onDidProcessExit.event;

	private readonly _onReadyMessage = new Emitter<IExtHostReadyMessage>();
	public readonly onReady = this._onReadyMessage.event;

	private disposeClient() {
		if (this.child) {
			this.child.kill();
			this.child = null;
		}
	}

	dispose() {
		this._onDidProcessExit.dispose();

		this.disposeClient();
	}

	sendIPCMessage(message: IExtHostMessage, sendHandle?: SendHandle): boolean {
		if (this.child && this.child.connected) {
			return this.child.send(message, sendHandle);
		}

		return false;
	}

	constructor(private modulePath: string, private options: IIPCOptions) {
		const args = options && options.args ? this.options.args : [];
		const forkOpts: ForkOptions = Object.create(null);

		forkOpts.silent = true;
		forkOpts.env = { ...deepClone(process.env), VSCODE_PARENT_PID: String(process.pid) };

		if (this.options && this.options.env) {
			forkOpts.env = { ...forkOpts.env, ...this.options.env };
		}

		if (this.options && this.options.freshExecArgv) {
			forkOpts.execArgv = [];
		}

		if (this.options && typeof this.options.debug === 'number') {
			forkOpts.execArgv = ['--nolazy', '--inspect=' + this.options.debug];
		}

		if (this.options && typeof this.options.debugBrk === 'number') {
			forkOpts.execArgv = ['--nolazy', '--inspect-brk=' + this.options.debugBrk];
		}

		if (forkOpts.execArgv === undefined) {
			// if not set, the forked process inherits the execArgv of the parent process
			// --inspect and --inspect-brk can not be inherited as the port would conflict
			forkOpts.execArgv = process.execArgv.filter(a => !/^--inspect(-brk)?=/.test(a)); // remove
		}

		if (isMacintosh && forkOpts.env) {
			// Unset `DYLD_LIBRARY_PATH`, as it leads to process crashes
			// See https://github.com/microsoft/vscode/issues/105848
			delete forkOpts.env['DYLD_LIBRARY_PATH'];
		}

		this.child = fork(this.modulePath, args, forkOpts);

		const onRawMessage = Event.fromNodeEventEmitter<ExtensionHostMessage>(this.child, 'message', msg => msg);

		onRawMessage(msg => {
			// Handle remote console logs specially
			if (isRemoteConsoleLog(msg)) {
				log(msg, `IPC Library: ${this.options.serverName}`);
				return;
			}

			if (msg.type === 'VSCODE_EXTHOST_IPC_READY') {
				this._onReadyMessage.fire(msg);
			}
		});

		const onExit = () => this.disposeClient();
		process.once('exit', onExit);

		this.child.on('error', err => console.warn('IPC "' + this.options.serverName + '" errored with ' + err));

		this.child.on('exit', (code: any, signal: any) => {
			process.removeListener('exit' as 'loaded', onExit); // https://github.com/electron/electron/issues/21475

			if (code !== 0 && signal !== 'SIGTERM') {
				console.warn('IPC "' + this.options.serverName + '" crashed with exit code ' + code + ' and signal ' + signal);
			}

			this._onDidProcessExit.fire({ code, signal });
		});
	}
}

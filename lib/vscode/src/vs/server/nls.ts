/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { FileAccess } from 'vs/base/common/network';
import * as lp from 'vs/base/node/languagePacks';
import product from 'vs/platform/product/common/product';
import { Translations } from 'vs/workbench/services/extensions/common/extensionPoints';
import { isInternalConfiguration } from '../base/common/nls';

const exists = util.promisify(fs.exists);
const readFile = util.promisify(fs.readFile);

const configurations = new Map<string, Promise<lp.NLSConfiguration>>();
const metadataPath = path.join(FileAccess.asFileUri('', require).fsPath, 'nls.metadata.json');

const createDefaultConfiguration = (): lp.NLSConfiguration => {
	return {
		locale: 'en',
		availableLanguages: {},
	};
};

export const getNlsConfiguration = async (locale: string, userDataPath: string): Promise<lp.NLSConfiguration | lp.InternalNLSConfiguration> => {
	const id = `${locale}: ${userDataPath}`;

	let nlsConfiguration = configurations.get(id);

	if (!nlsConfiguration) {
		nlsConfiguration = new Promise(async resolve => {
			let config: lp.NLSConfiguration;

			// TODO: Should we use an environment service for the commit?
			if (product.commit && (await exists(metadataPath))) {
				config = await lp.getNLSConfiguration(product.commit, userDataPath, metadataPath, locale);
			} else {
				config = createDefaultConfiguration();
			}

			if (isInternalConfiguration(config)) {
				config._languagePackSupport = true;
			}

			// If the configuration has no results keep trying since code-server
			// doesn't restart when a language is installed so this result would
			// persist (the plugin might not be installed yet or something).
			if (config.locale !== 'en' && config.locale !== 'en-us' && Object.keys(config.availableLanguages).length === 0) {
				configurations.delete(id);
			}

			resolve(config);
		});

		configurations.set(id, nlsConfiguration);
	}
	return nlsConfiguration;
};

export const getTranslations = async (locale: string, userDataPath: string): Promise<Translations> => {
	const config = await getNlsConfiguration(locale, userDataPath);
	if (isInternalConfiguration(config)) {
		try {
			return JSON.parse(await readFile(config._translationsConfigFile, 'utf8'));
		} catch (error) {
			/* Nothing yet. */
		}
	}
	return {};
};

export const getLocaleFromConfig = async (userDataPath: string): Promise<string> => {
	const files = ['locale.json', 'argv.json'];
	for (let i = 0; i < files.length; ++i) {
		try {
			const localeConfigUri = path.join(userDataPath, 'User', files[i]);
			const content = stripComments(await readFile(localeConfigUri, 'utf8'));
			return JSON.parse(content).locale;
		} catch (error) {
			/* Ignore. */
		}
	}
	return 'en';
};

// Taken from src/main.js in the main VS Code source.
const stripComments = (content: string): string => {
	const regexp = /('(?:[^\\']*(?:\\.)?)*')|('(?:[^\\']*(?:\\.)?)*')|(\/\*(?:\r?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))/g;

	return content.replace(regexp, (match, _m1, _m2, m3, m4) => {
		// Only one of m1, m2, m3, m4 matches
		if (m3) {
			// A block comment. Replace with nothing
			return '';
		} else if (m4) {
			// A line comment. If it ends in \r?\n then keep it.
			const length_1 = m4.length;
			if (length_1 > 2 && m4[length_1 - 1] === '\n') {
				return m4[length_1 - 2] === '\r' ? '\r\n' : '\n';
			} else {
				return '';
			}
		} else {
			// We match a string
			return match;
		}
	});
};

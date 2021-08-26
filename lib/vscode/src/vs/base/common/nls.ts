/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lp from 'vs/base/node/languagePacks';

export const isInternalConfiguration = (config: lp.NLSConfiguration): config is lp.InternalNLSConfiguration => {
	return config && !!(<lp.InternalNLSConfiguration>config)._languagePackId;
};

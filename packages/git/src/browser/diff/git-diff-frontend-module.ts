/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { GitDiffService } from './git-diff-service';
import { GitDiffWidget } from './git-diff-widget';
import { interfaces } from "inversify";
import { GIT_DIFF, GitDiffContribution } from './git-diff-contribution';
import { WidgetFactory } from "@theia/core/lib/browser";
import { CommandContribution, MenuContribution } from '@theia/core';

import '../../../src/browser/style/diff.css';

export function bindGitDiffModule(bind: interfaces.Bind) {

    bind(GitDiffService).toSelf().inSingletonScope();

    bind(GitDiffWidget).toSelf();

    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: GIT_DIFF,
        createWidget: () => ctx.container.get<GitDiffWidget>(GitDiffWidget)
    }));

    bind(GitDiffContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution]) {
        bind(identifier).toDynamicValue(ctx =>
            ctx.container.get(GitDiffContribution)
        ).inSingletonScope();
    }

}

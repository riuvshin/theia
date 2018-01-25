/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { GitLogOptions } from './git-diff-model';
import { injectable, inject } from "inversify";
import { GitRepositoryProvider } from '../git-repository-provider';
import { Git, Repository } from '../../common';
import { FileUri } from '@theia/core/lib/node/file-uri';
import * as Path from 'path';

@injectable()
export class GitDiffService {

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider
    ) { }

    protected toUri(repository: Repository, pathSegment: undefined): undefined;
    protected toUri(repository: Repository, pathSegment: string): string;
    protected toUri(repository: Repository, pathSegment: string | undefined): string | undefined {
        if (pathSegment === undefined) {
            return undefined;
        }
        return FileUri.create(Path.join(FileUri.fsPath(repository.localUri), pathSegment)).toString();
    }

    protected getRangeArg(options?: GitLogOptions): string {
        let range = 'HEAD';
        if (options) {
            if (options.toRevision) {
                range = options.toRevision;
            }
            if (typeof options.fromRevision === 'number') {
                range = `${range}~${options.fromRevision}..${range}`;
            } else if (typeof options.fromRevision === 'string') {
                range = `${options.fromRevision}~1..${range}`;
            }
        }
        return range;
    }
}

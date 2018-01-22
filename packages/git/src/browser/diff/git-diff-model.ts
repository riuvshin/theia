/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Options for further refining the `git log` commands.
 */
export interface GitLogOptions {

    /**
     * The uri of a file to run the `git diff` command. If not set, the diff for all files in the given range are fetched.
     */
    readonly fileUri?: string;

    /**
     * The last revision that should be included among the result running this query. Here, the revision can be a tag, a commitish,
     * or even an expression (`HEAD~3`). For more details to specify the revision, see [here](https://git-scm.com/docs/gitrevisions#_specifying_revisions).
     */
    readonly toRevision?: string;

    /**
     * Either the from revision (`string`) or a positive integer that is equivalent to the `~` suffix, which means the commit object that is the `fromRevision`<sup>th</sup>
     * generation ancestor of the named, `toRevision` commit object, following only the first parents. If not specified, equivalent to `git log origin..toRevision`.
     */
    readonly fromRevision?: number | string;

    /**
     * Limits the number of commits. Also known as `-n` or `--number. If not specified, or not a positive integer, then will be ignored, and the returning list
     * of commits will not be limited.
     */
    readonly maxCount?: number;

}

export interface GitDiffViewOptions extends GitLogOptions {
    title?: string;
}

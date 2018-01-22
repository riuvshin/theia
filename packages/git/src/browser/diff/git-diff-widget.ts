/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { h } from "@phosphor/virtualdom";
import { GIT_DIFF } from "./git-diff-contribution";
import { DiffUris } from '@theia/editor/lib/browser/diff-uris';
import { GitDiffService } from './git-diff-service';
import { GitDiffViewOptions } from './git-diff-model';
import { VirtualRenderer, open, OpenerService, StatefulWidget } from "@theia/core/lib/browser";
import { GitRepositoryProvider } from '../git-repository-provider';
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import URI from "@theia/core/lib/common/uri";
import { GitFileChange, GitFileStatus, GitUtils } from '../../common';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { GitBaseWidget } from "../git-base-widget";
import { GitFileChangeNode } from "../git-widget";
import { NotificationsMessageClient } from "@theia/messages/lib/browser/notifications-message-client";
import { MessageType } from "@theia/core";

export interface GitDiffFileDescription {
    icon: string,
    label: string,
    path: string
}

export interface GitDiffViewModel {
    options: GitDiffViewOptions;
    fileChangeNodes: GitFileChangeNode[];
    toRevision?: string;
    fromRevision?: string | number;
    gitDiffFile?: GitDiffFileDescription
}

export namespace GitDiffViewModel {
    export function is(model: any): model is GitDiffViewModel {
        return 'gitDiffFile' in model && 'fromRevision' in model && 'toRevision' in model && 'fileChangeNodes' in model && 'options' in model;
    }
}

@injectable()
export class GitDiffWidget extends GitBaseWidget implements StatefulWidget {

    protected viewModel: GitDiffViewModel;

    constructor(
        @inject(GitDiffService) protected readonly gitDiffService: GitDiffService,
        @inject(GitRepositoryProvider) protected repositoryProvider: GitRepositoryProvider,
        @inject(LabelProvider) protected labelProvider: LabelProvider,
        @inject(NotificationsMessageClient) protected readonly notifications: NotificationsMessageClient,
        @inject(OpenerService) protected openerService: OpenerService) {
        super();
        this.id = GIT_DIFF;
        this.title.label = "Files changed";

        this.addClass('theia-git');
    }

    async initialize(options: GitDiffViewOptions) {
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            const fileChanges: GitFileChange[] = await this.gitDiffService.getDiff(repository, options);
            const fileChangeNodes: GitFileChangeNode[] = [];
            for (const fileChange of fileChanges) {
                const uri = fileChange.uri;
                const fileChangeUri = new URI(uri);
                const status = fileChange.status;
                const [icon, label, description] = await Promise.all([
                    this.labelProvider.getIcon(fileChangeUri),
                    this.labelProvider.getName(fileChangeUri),
                    repository ? GitUtils.getRepositoryRelativePath(repository, fileChangeUri) : this.labelProvider.getLongName(fileChangeUri)
                ]);
                fileChangeNodes.push({
                    icon, label, description, uri, status
                });
            }
            let gitDiffFile: GitDiffFileDescription | undefined = undefined;
            if (options.fileUri) {
                const uri: URI = new URI(options.fileUri);
                const [icon, label, path] = await Promise.all([
                    this.labelProvider.getIcon(uri),
                    this.labelProvider.getName(uri),
                    repository ? GitUtils.getRepositoryRelativePath(repository, uri) : this.labelProvider.getLongName(uri)
                ]);
                gitDiffFile = {
                    icon, label, path
                };
            }
            this.viewModel = {
                gitDiffFile,
                options,
                fileChangeNodes,
                toRevision: options.toRevision,
                fromRevision: options.fromRevision ? options.fromRevision.toString() : undefined
            };
            this.update();
        }
    }

    storeState(): object {
        return this.viewModel;
    }

    restoreState(oldState: object): void {
        if (GitDiffViewModel.is(oldState)) {
            this.viewModel = oldState;
            this.update();
        }
    }

    protected render(): h.Child {
        const commitishBar = this.renderDiffListHeader();
        const fileChangeList = this.renderFileChangeList();
        return h.div({ className: "git-diff-container" }, VirtualRenderer.flatten([commitishBar, fileChangeList]));
    }

    protected renderDiffListHeader(): h.Child {
        let fileDiv: h.Child = '';
        if (this.viewModel.gitDiffFile && !this.viewModel.options.title) {
            const iconSpan = h.span({ className: this.viewModel.gitDiffFile.icon + ' file-icon' });
            const nameSpan = h.span({ className: 'name' }, this.viewModel.gitDiffFile.label + ' ');
            const pathSpan = h.span({ className: 'path' }, this.viewModel.gitDiffFile.path);
            const compareDiv = h.span({}, 'Compare ');
            fileDiv = h.div({ className: "gitItem diff-file" }, h.div({ className: "noWrapInfo" }, compareDiv, iconSpan, nameSpan, pathSpan));
            const withSpan = h.span({ className: 'row-title' }, 'with ');
            const fromDiv =
                this.viewModel.fromRevision && typeof this.viewModel.fromRevision !== 'number' ?
                    h.div({ className: "revision noWrapInfo" }, withSpan, this.viewModel.fromRevision.toString()) :
                    'previous revision';
            return h.div({ className: "commitishBar" }, fileDiv, fromDiv);
        } else {
            const header = this.viewModel.options.title ? h.div({ className: 'git-diff-header' }, this.viewModel.options.title) : '';
            return h.div({ className: "commitishBar" }, header);
        }
    }

    protected renderFileChangeList(): h.Child {
        const files: h.Child[] = [];

        for (const fileChange of this.viewModel.fileChangeNodes) {
            const fileChangeElement: h.Child = this.renderGitItem(fileChange);
            files.push(fileChangeElement);
        }
        const header = h.div({ className: 'theia-header' }, 'Files changed');
        const list = h.div({ className: "commitFileList" }, ...files);
        return h.div({ className: "commitFileListContainer" }, header, list);
    }

    protected renderGitItem(change: GitFileChangeNode): h.Child {
        const uri: URI = new URI(change.uri);

        const iconSpan = h.span({ className: change.icon + ' file-icon' });
        const nameSpan = h.span({ className: 'name' }, change.label + ' ');
        const pathSpan = h.span({ className: 'path' }, change.uri);
        const nameAndPathDiv = h.div({
            className: 'noWrapInfo',
            ondblclick: () => {
                let diffuri: URI | undefined;
                let fromURI: URI;
                if (this.viewModel.fromRevision && typeof this.viewModel.fromRevision !== 'number') {
                    fromURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.viewModel.fromRevision);
                } else if (this.viewModel.fromRevision) {
                    fromURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.viewModel.toRevision + "~" + this.viewModel.fromRevision);
                } else {
                    fromURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.viewModel.toRevision + "~1");
                }
                const toURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.viewModel.toRevision || 'HEAD');
                diffuri = DiffUris.encode(fromURI, toURI, uri.displayName);
                if (diffuri) {
                    open(this.openerService, diffuri).catch(e => {
                        const message = e.message.split('\n\n')[0];
                        this.notifications.showMessage({
                            text: message,
                            type: MessageType.Error
                        });
                    });
                }
            }
        }, iconSpan, nameSpan, pathSpan);
        const statusDiv = h.div({ className: 'status ' + GitFileStatus[change.status].toLowerCase() }, this.getStatusChar(change.status, change.staged || false));
        return h.div({ className: 'gitItem noselect' }, nameAndPathDiv, statusDiv);
    }
}

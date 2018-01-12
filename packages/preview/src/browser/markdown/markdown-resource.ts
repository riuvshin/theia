/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// // import { injectable, inject } from "inversify";
// import {
//     // ResourceResolver,
//     Resource,
//     // ResourceProvider,
//     DisposableCollection, Emitter, Event
// } from "@theia/core";
// import { TextDocument, DidChangeTextDocumentParams } from "@theia/languages/lib/common";
// import URI from "@theia/core/lib/common/uri";
// import { Workspace } from '@theia/languages/lib/common';
// // import { MarkdownUri } from "./markdown-uri";

// // import * as hljs from 'highlight.js';
// // import * as markdownit from 'markdown-it';

// export class MarkdownResource implements Resource {

//     protected readonly originalUri: string;
//     protected readonly toDispose = new DisposableCollection();
//     protected readonly onDidChangeContentsEmitter = new Emitter<void>();

//     constructor(
//         public readonly uri: URI,
//         protected readonly originalResource: Resource,
//         protected readonly workspace: Workspace,
//         protected readonly renderer: (input: string) => string
//     ) {
//         this.originalUri = this.originalResource.uri.toString();
//         this.toDispose.push(originalResource);
//         this.toDispose.push(this.onDidChangeContentsEmitter);
//         if (originalResource.onDidChangeContents) {
//             this.toDispose.push(originalResource.onDidChangeContents(() => this.fireDidChangeContents()));
//         }
//         this.toDispose.push(this.workspace.onDidOpenTextDocument((document: TextDocument) => this.fireDidChangeContents(document.uri)));
//         this.toDispose.push(this.workspace.onDidChangeTextDocument((params: DidChangeTextDocumentParams) => this.fireDidChangeContents(params.textDocument.uri)));
//         this.toDispose.push(this.workspace.onDidCloseTextDocument((document: TextDocument) => this.fireDidChangeContents(document.uri)));
//     }

//     dispose(): void {
//         this.toDispose.dispose();
//     }

//     get onDidChangeContents(): Event<void> {
//         return this.onDidChangeContentsEmitter.event;
//     }

//     protected fireDidChangeContents(affectedUri?: string): void {
//         if (this.shouldFireDidChangeContents(affectedUri)) {
//             this.onDidChangeContentsEmitter.fire(undefined);
//         }
//     }

//     protected shouldFireDidChangeContents(affectedUri?: string): boolean {
//         return !affectedUri || affectedUri === this.originalUri;
//     }

//     async readContents(options?: { encoding?: string | undefined; }): Promise<string> {
//         const document = this.workspace.textDocuments.find((doc: TextDocument) => doc.uri === this.originalUri);
//         if (document) {
//             return this.render(document.getText());
//         }
//         return this.render(await this.originalResource.readContents(options));
//     }

//     protected render(text: string): string {
//         return this.render(text);
//     }

// }

// // @injectable()
// // export class MarkdownResourceResolver implements ResourceResolver {

// //     @inject(MarkdownUri)
// //     protected readonly markdownUri: MarkdownUri;

// //     @inject(Workspace)
// //     protected readonly workspace: Workspace;

// //     @inject(ResourceProvider)
// //     protected readonly resourceProvider: ResourceProvider;

// //     async resolve(uri: URI): Promise<MarkdownResource> {
// //         const resourceUri = this.markdownUri.from(uri);
// //         const originalResource = await this.resourceProvider(resourceUri);
// //         return new MarkdownResource(uri, originalResource, this.workspace, this.getEngine());
// //     }

// //     // protected engine: markdownit.MarkdownIt | undefined;
// //     // protected getEngine(): markdownit.MarkdownIt {
// //     //     if (!this.engine) {
// //     //         const engine: markdownit.MarkdownIt = this.engine = markdownit({
// //     //             html: true,
// //     //             linkify: true,
// //     //             highlight: (str, lang) => {
// //     //                 if (lang && hljs.getLanguage(lang)) {
// //     //                     try {
// //     //                         return '<pre class="hljs"><code>' + hljs.highlight(lang, str, true).value + '</code></pre>';
// //     //                     } catch { }
// //     //                 }
// //     //                 return '<pre class="hljs"><code>' + engine.utils.escapeHtml(str) + '</code></pre>';
// //     //             }
// //     //         });
// //     //         const indexingTokenRenderer: markdownit.TokenRender = (tokens, index, options, env, self) => {
// //     //             const token = tokens[index];
// //     //             if (token.map && token.level === 0) {
// //     //                 const line = token.map[0];
// //     //                 token.attrJoin('class', 'line');
// //     //                 token.attrSet('data-line', line.toString());
// //     //             }
// //     //             return self.renderToken(tokens, index, options);
// //     //         };
// //     //         engine.renderer.rules.heading_open = indexingTokenRenderer;
// //     //         engine.renderer.rules.paragraph_open = indexingTokenRenderer;
// //     //     }
// //     //     return this.engine;
// //     // }

// // }

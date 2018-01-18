/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { ResourceProvider } from "@theia/core";
import { PreviewHandler } from '../preview-handler';
import URI from "@theia/core/lib/common/uri";

import * as hljs from 'highlight.js';
import * as markdownit from 'markdown-it';

import '../../../src/browser/markdown/style/index.css';

@injectable()
export class MarkdownPreviewHandler implements PreviewHandler {

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    readonly iconClass: string = 'markdown-icon file-icon';
    readonly contentClass: string = 'markdown-preview';

    canHandle(uri: URI): number {
        return uri.path.ext === '.md' ? 500 : 0;
    }

    renderHTML(content: string): string {
        return this.getEngine().render(content);
    }

    findElementForSourceLine(sourceLine: number, renderedNode: HTMLElement): HTMLElement | undefined {
        const markedElements = renderedNode.getElementsByClassName('line');
        let matchedElement: HTMLElement | undefined;
        for (let i = 0; i < markedElements.length; i++) {
            const element = markedElements[i];
            const line = Number.parseInt(element.getAttribute('data-line') || '0');
            if (line > sourceLine) {
                break;
            }
            matchedElement = element as HTMLElement;
        }
        return matchedElement;
    }

    getSourceLineForOffset(content: HTMLElement, offset: number): number | undefined {
        const filter: NodeFilter = {
            acceptNode: (node: Node) => {
                if (node instanceof HTMLElement) {
                    if (node.classList.contains('line')) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
                return NodeFilter.FILTER_REJECT;
            }
        };
        const treeWalker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT, filter, false);
        let lastElement: HTMLElement | undefined = undefined;
        while (treeWalker.nextNode()) {
            const current = treeWalker.currentNode as HTMLElement;
            const offsetTop = current.offsetTop;
            if (offsetTop > offset) {
                break;
            }
            lastElement = current;
        }
        if (!lastElement) {
            return undefined;
        }
        const line = Number.parseInt(lastElement.getAttribute('data-line') || '0');
        return line;
    }

    protected engine: markdownit.MarkdownIt | undefined;
    protected getEngine(): markdownit.MarkdownIt {
        if (!this.engine) {
            const engine: markdownit.MarkdownIt = this.engine = markdownit({
                html: true,
                linkify: true,
                highlight: (str, lang) => {
                    if (lang && hljs.getLanguage(lang)) {
                        try {
                            return '<pre class="hljs"><code>' + hljs.highlight(lang, str, true).value + '</code></pre>';
                        } catch { }
                    }
                    return '<pre class="hljs"><code>' + engine.utils.escapeHtml(str) + '</code></pre>';
                }
            });
            const indexingTokenRenderer: markdownit.TokenRender = (tokens, index, options, env, self) => {
                const token = tokens[index];
                if (token.map) {
                    const line = token.map[0];
                    token.attrJoin('class', 'line');
                    token.attrSet('data-line', line.toString());
                }
                return self.renderToken(tokens, index, options);
            };
            engine.renderer.rules.heading_open = indexingTokenRenderer;
            engine.renderer.rules.paragraph_open = indexingTokenRenderer;
            engine.renderer.rules.list_item_open = indexingTokenRenderer;
        }
        return this.engine;
    }

}

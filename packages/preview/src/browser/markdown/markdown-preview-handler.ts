/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { PreviewHandler } from '../preview-handler';
import URI from "@theia/core/lib/common/uri";

import * as hljs from 'highlight.js';
import * as markdownit from 'markdown-it';

@injectable()
export class MarkdownPreviewHandler implements PreviewHandler {

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
        const lineElements = this.getLineElementsAtOffset(content, offset);
        if (lineElements.length < 1) {
            return undefined;
        }
        const firstLineNumber = this.getLineNumberFromAttribute(lineElements[0]);
        const secondLineNumber = this.getLineNumberFromAttribute(lineElements[1]);
        if (firstLineNumber === undefined) {
            return undefined;
        }
        if (lineElements.length === 1) {
            return firstLineNumber;
        }
        if (secondLineNumber === undefined) {
            return firstLineNumber;
        }
        const y1 = lineElements[0].offsetTop;
        const y2 = lineElements[1].offsetTop;
        const dY = (offset - y1) / (y2 - y1);
        const dL = (secondLineNumber - firstLineNumber) * dY;
        const line = firstLineNumber + Math.floor(dL);
        return line;
    }

    /**
     * returns two significant line elements for the given offset.
     */
    protected getLineElementsAtOffset(content: HTMLElement, offset: number): HTMLElement[] {
        let skipNext = false;
        const filter: NodeFilter = {
            acceptNode: (node: Node) => {
                if (node instanceof HTMLElement) {
                    if (node.classList.contains('line')) {
                        if (skipNext) {
                            return NodeFilter.FILTER_SKIP;
                        }
                        if (node.offsetTop > offset) {
                            skipNext = true;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
                return NodeFilter.FILTER_REJECT;
            }
        };
        const treeWalker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT, filter, false);
        const lineElements: HTMLElement[] = [];
        while (treeWalker.nextNode()) {
            const element = treeWalker.currentNode as HTMLElement;
            lineElements.push(element);
        }
        return lineElements.slice(-2);
    }

    protected getLineNumberFromAttribute(element: HTMLElement): number | undefined {
        const attribute = element.getAttribute('data-line');
        return attribute ? Number.parseInt(attribute) : undefined;
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

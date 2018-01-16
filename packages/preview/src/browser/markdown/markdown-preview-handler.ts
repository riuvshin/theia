/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { ResourceProvider } from "@theia/core";
import { Workspace } from '@theia/languages/lib/common';
import { PreviewHandler } from '../preview-handler';
import { PREVIEW_WIDGET_CLASS } from '../preview-widget';
import URI from "@theia/core/lib/common/uri";

import * as hljs from 'highlight.js';
import * as markdownit from 'markdown-it';

@injectable()
export class MarkdownPreviewHandler implements PreviewHandler {

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    canHandle(uri: URI): boolean {
        return uri.path.ext === '.md';
    }

    @inject(Workspace)
    protected readonly workspace: Workspace;

    renderHTML(content: string): string {
        return this.getEngine().render(content);
    }

    findElementForSourceLine(sourceLine: number, renderedNode: Element): Element | undefined {
        const markedElements = renderedNode.getElementsByClassName('line');
        let matchedElement: Element | undefined;
        for (let i = 0; i < markedElements.length; i++) {
            const element = markedElements[i];
            const line = Number.parseInt(element.getAttribute('data-line') || '0');
            if (line > sourceLine) {
                break;
            }
            matchedElement = element;
        }
        return matchedElement;
    }

    getSourceLineForElement(selectedElement: Element): number | undefined {
        let current: Element | null = selectedElement;
        while (current) {
            const parent = current.parentElement;
            if (parent && parent.classList.contains(PREVIEW_WIDGET_CLASS)) {
                break;
            }
            current = current.parentElement;
        }
        while (current) {
            if (current.classList.contains('line')) {
                break;
            }
            current = current.previousElementSibling;
        }
        if (!current) {
            return undefined;
        }
        const line = Number.parseInt(current.getAttribute('data-line') || '0');
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
                if (token.map && token.level === 0) {
                    const line = token.map[0];
                    token.attrJoin('class', 'line');
                    token.attrSet('data-line', line.toString());
                }
                return self.renderToken(tokens, index, options);
            };
            engine.renderer.rules.heading_open = indexingTokenRenderer;
            engine.renderer.rules.paragraph_open = indexingTokenRenderer;
        }
        return this.engine;
    }

}

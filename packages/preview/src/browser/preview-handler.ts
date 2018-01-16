/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { ContributionProvider } from "@theia/core";

export const PreviewHandler = Symbol('PreviewHandler');

export interface PreviewHandler {
    canHandle(uri: URI): boolean;
    renderHTML(content: string): string;
    findElementForSourceLine(sourceLine: number, renderedNode: Element): Element | undefined;
    getSourceLineForElement(selectedElement: Element): number | undefined;
}

@injectable()
export class PreviewHandlerProvider {

    constructor(
        @inject(ContributionProvider) @named(PreviewHandler)
        protected readonly previewHandlerContributions: ContributionProvider<PreviewHandler>
    ) { }

    get(uri: URI): PreviewHandler | undefined {
        const previewHandlers = this.previewHandlerContributions.getContributions();
        return previewHandlers.find(handler => handler.canHandle(uri));
    }

    canHandle(uri: URI): boolean {
        return this.get(uri) !== undefined;
    }

}

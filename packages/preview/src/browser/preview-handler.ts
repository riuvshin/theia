/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { ContributionProvider, MaybePromise, Prioritizeable } from "@theia/core";

export const PreviewHandler = Symbol('PreviewHandler');

export interface PreviewHandler {
    readonly iconClass?: string;
    readonly contentClass: string;
    canHandle(uri: URI): number;
    renderHTML(content: string): MaybePromise<string | undefined>;
    findElementForSourceLine?(sourceLine: number, renderedNode: HTMLElement): HTMLElement | undefined;
    getSourceLineForOffset?(content: HTMLElement, offset: number): number | undefined;
}

@injectable()
export class PreviewHandlerProvider {

    constructor(
        @inject(ContributionProvider) @named(PreviewHandler)
        protected readonly previewHandlerContributions: ContributionProvider<PreviewHandler>
    ) { }

    findContribution(uri: URI): PreviewHandler[] {
        const prioritized = Prioritizeable.prioritizeAllSync(this.previewHandlerContributions.getContributions(), contrib =>
            contrib.canHandle(uri)
        );
        return prioritized.map(c => c.value);
    }

    canHandle(uri: URI): boolean {
        return this.findContribution(uri).length > 0;
    }

}

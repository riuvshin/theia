/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from "inversify";
import * as fileIcons from "file-icons-js";
import URI from "../common/uri";
import { ContributionProvider } from '../common/contribution-provider';
import { Prioritizeable, MaybePromise } from '../common/types';

import "file-icons-js/css/style.css";

export const LabelProviderContribution = Symbol('LabelProviderContribution');
export interface LabelProviderContribution {

    /**
     * whether this contribution can handle the given element and with what priority.
     * All contributions are ordered by the returned number if greater than zero. The highest number wins.
     * If two or more contributions return the same positive number one of those will be used. It is undefined which one.
     */
    canHandle(element: object): number;

    /**
     * returns an icon class for the given element.
     */
    getIcon?(element: object): MaybePromise<string>;

    /**
     * returns a short name for the given element.
     */
    getName?(element: object): string;

    /**
     * returns a long name for the given element.
     */
    getLongName?(element: object): string;

}

@injectable()
export class DefaultUriLabelProviderContribution implements LabelProviderContribution {

    canHandle(uri: object): number {
        if (uri instanceof URI) {
            return 1;
        }
        return 0;
    }

    getIcon(uri: URI): MaybePromise<string> {
        const iconClass = this.getFileIcon(uri);
        if (!iconClass) {
            if (uri.displayName.indexOf('.') === -1) {
                return 'fa fa-folder';
            } else {
                return 'fa fa-file';
            }
        }
        return iconClass;
    }

    protected getFileIcon(uri: URI): string | undefined {
        return fileIcons.getClass(uri.displayName);
    }

    getName(uri: URI): string {
        return uri.displayName;
    }

    getLongName(uri: URI): string {
        return uri.parent.path.toString();
    }
}

@injectable()
export class LabelProvider {

    constructor(
        @inject(ContributionProvider) @named(LabelProviderContribution)
        protected readonly contributionProvider: ContributionProvider<LabelProviderContribution>
    ) { }

    async getIcon(element: object): Promise<string> {
        const contribs = this.findContribution(element);
        const contrib = contribs.find(c => c.getIcon !== undefined);
        if (!contrib) {
            return "";
        }
        return contrib.getIcon!(element);
    }

    getName(element: object): string {
        const contribs = this.findContribution(element);
        const contrib = contribs.find(c => c.getName !== undefined);
        if (!contrib) {
            return "<unknown>";
        }
        return contrib.getName!(element);
    }

    getLongName(element: object): string {
        const contribs = this.findContribution(element);
        const contrib = contribs.find(c => c.getLongName !== undefined);
        if (!contrib) {
            return "";
        }
        return contrib!.getLongName!(element);
    }

    protected findContribution(element: object): LabelProviderContribution[] {
        const prioritized = Prioritizeable.prioritizeAllSync(this.contributionProvider.getContributions(), contrib =>
            contrib.canHandle(element)
        );
        return prioritized.map(c => c.value);
    }

}

/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { VirtualWidget } from "@theia/core/lib/browser";
import { GitFileStatus } from '../common';

export class GitBaseWidget extends VirtualWidget {

    protected getStatusChar(status: GitFileStatus, staged: boolean): string {
        switch (status) {
            case GitFileStatus.New:
            case GitFileStatus.Renamed:
            case GitFileStatus.Copied: return staged ? 'A' : 'U';
            case GitFileStatus.Modified: return 'M';
            case GitFileStatus.Deleted: return 'D';
            case GitFileStatus.Conflicted: return 'C';
        }
        return '';
    }
}

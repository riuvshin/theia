/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import {
    CommandContribution,
    MenuContribution,
    bindContributionProvider
} from '@theia/core/lib/common';
import {
    OpenHandler,
    WidgetFactory,
    FrontendApplicationContribution
} from '@theia/core/lib/browser';
import { PreviewContribution } from './preview-contribution';
import { PreviewWidget, PREVIEW_WIDGET_FACTORY_ID } from './preview-widget';
import { PreviewHandler, PreviewHandlerProvider } from './preview-handler';
import { MarkdownPreviewHandler } from './markdown';

// TODO split styles into generic and specific (markdown) part
import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(PreviewHandlerProvider).toSelf().inSingletonScope();
    bindContributionProvider(bind, PreviewHandler);
    bind(MarkdownPreviewHandler).toSelf().inSingletonScope();
    bind(PreviewHandler).toDynamicValue(ctx => ctx.container.get(MarkdownPreviewHandler));

    bind(PreviewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => <WidgetFactory>{
        id: PREVIEW_WIDGET_FACTORY_ID,
        createWidget: async () => ctx.container.get(PreviewWidget)
    });

    bind(PreviewContribution).toSelf().inSingletonScope();
    [CommandContribution, MenuContribution, OpenHandler, FrontendApplicationContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toDynamicValue(c => c.container.get(PreviewContribution)).inSingletonScope()
    );
});

package com.textilehub.catalogue;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(GooglePlayBillingPlugin.class);
        registerPlugin(DriveFilePickerPlugin.class);
        registerPlugin(ThreadXNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

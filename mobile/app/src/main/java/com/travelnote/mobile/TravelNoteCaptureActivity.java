package com.travelnote.mobile;

import com.journeyapps.barcodescanner.CaptureActivity;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;

/** Custom scanner screen with a square, quiet viewfinder. */
public class TravelNoteCaptureActivity extends CaptureActivity {
    @Override
    protected DecoratedBarcodeView initializeContent() {
        setContentView(R.layout.activity_capture);
        return findViewById(R.id.zxing_barcode_scanner);
    }
}

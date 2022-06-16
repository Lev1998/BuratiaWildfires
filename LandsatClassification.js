var start = ee.Date('2019-06-15')
var finish = ee.Date('2019-09-15')

//cloud mask
function maskL8sr(image) {
  // Биты 3 и 5 — это тень облака и облако соответственно.
  var cloudShadowBitMask = (1 << 3);
  var cloudsBitMask = (1 << 5);
  // Получите полосу QA пикселей.
  var qa = image.select('pixel_qa');
  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
                 .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
  return image.updateMask(mask);
}



//masked water
var maskWater=function(img){
  
    // Подгружаем изображение где определенны водные ресурсы  
    var hansenImage = ee.Image('UMD/hansen/global_forest_change_2015');
    
    // Создаем маску воды
    var mask = hansenImage.select('datamask').eq(1);
    
    // Получаем изображение с замаскированными водными ресурсами
    return img.updateMask(mask);
    
}

var img=ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
            .filterBounds(ROI)
            .filterDate(start,finish)
            .filter(ee.Filter.lt('CLOUD_COVER_LAND',60))
            .map(maskL8sr)
            .map(maskWater);




var img2 =  img.median().clip(ROI);
  
  
// Рассчитываем слой NDVI
var addNDVI = function(image) {
  
  var ndvi = image.normalizedDifference(['B5', 'B4']).rename('NDVI');
  
  return image.addBands(ndvi);
};  



// Рассчитываем слой NDMI
var addNDMI = function(image) {
  
  var ndmi= image.normalizedDifference(['B5', 'B6']).rename('NDMI');
  
  return image.addBands(ndmi);
};

// Рассчитываем слой BSI
var addBSI = function(image) {
  
  var bsi= image.expression(
    '((SWIR2 + RED) - (NIR + BLUE))/ ((SWIR2 + RED) + (NIR + BLUE ))', {
      'SWIR2':image.select('B7'),
      'NIR': image.select('B5'),
      'RED': image.select('B4'),
      'BLUE': image.select('B2')
}).rename('BSI');

  return image.addBands(bsi);
};

// 
var addBands = function(image){
  var nv = addNDVI(image);
  var nd = addNDMI(nv);
  var bs = addBSI(nd);
  return bs;
}

var img_add_bands = addBands(img2)


 // Texturas Standard Deviation
var texture_NIR = img_add_bands.select('B5').reduceNeighborhood({
     reducer: ee.Reducer.stdDev(),
     kernel: ee.Kernel.square(5),
});

var texture_NDVI = img_add_bands.select('NDVI').reduceNeighborhood({
     reducer: ee.Reducer.stdDev(),
     kernel: ee.Kernel.square(5),
});

var texture_NDMI = img_add_bands.select('NDMI').reduceNeighborhood({
     reducer: ee.Reducer.stdDev(),
     kernel: ee.Kernel.square(5),
});

var texture_BSI = img_add_bands.select('BSI').reduceNeighborhood({
     reducer: ee.Reducer.stdDev(),
     kernel: ee.Kernel.square(5),
});

// Texturas Median
var texture_NIR_median = img_add_bands.select('B5').reduceNeighborhood({
     reducer: ee.Reducer.median(),
     kernel: ee.Kernel.square(5),
});

var texture_NDVI_median = img_add_bands.select('NDVI').reduceNeighborhood({
     reducer: ee.Reducer.median(),
     kernel: ee.Kernel.square(5),
});

var texture_NDMI_median = img_add_bands.select('NDMI').reduceNeighborhood({
     reducer: ee.Reducer.median(),
     kernel: ee.Kernel.square(5),
});

var texture_BSI_median = img_add_bands.select('BSI').reduceNeighborhood({
     reducer: ee.Reducer.median(),
     kernel: ee.Kernel.square(5),
});

var img_rez = img_add_bands.addBands(texture_NDVI ).addBands(texture_NDMI ).addBands(texture_BSI )
  .addBands(texture_NDVI_median ).addBands(texture_NDMI_median ).addBands(texture_BSI_median )
  .addBands(texture_NIR_median).addBands(texture_NIR)


//классификация
var polygons=Forest.merge(Bare_Urban).merge(Steppe_grassland).merge(Agriculture);
Map.addLayer(polygons,{}, 'Dataset');


var bandsTr = ['B2','B3','B4','B5','B6','B7','NDVI','NDMI','BSI','NDVI_stdDev','NDMI_stdDev','BSI_stdDev',
'B5_stdDev','NDVI_median','NDMI_median','BSI_median','B5_median'];

// Определяем какие пиксели берём для обучения
var trainung = img_rez.sampleRegions({
  collection:polygons,
  properties:['class'],
  scale:50
});

// Создание классификатора
var classifier=ee.Classifier.smileRandomForest({
  numberOfTrees:500
})

// Обучение классификатора
var trained = classifier.train(trainung,'class',bandsTr);

var classified = img_rez.classify(trained)
var classified_1chanel=classified.select('classification')

// Палитра для классифицированного изображения
var visClassif = {
  min:0,
  max:3,
  palette:['#f1ffd3','#ffc82d','#00ffff','#bf04c2']
};


//палитра для отображения NDVI
var ndviParams = {bands:['NDVI'],min: 0, max: 2, palette: [
'FFFFFF', 'CE7E45', 'FCD163', '66A000', '207401',
'056201', '004C00', '023B01', '012E01', '011301']};


var visParams = {bands:['B4','B3','B2'], min:0, max:3000, gamma:1.4};
Map.centerObject(ROI,4);
Map.addLayer(img,visParams,'Image Collections')
Map.addLayer(img2,visParams,'Cloud mask')
Map.addLayer(img_rez,ndviParams,'NDVI')
Map.addLayer(classified,visClassif,'Classified')

var img_ndvi=img_rez.select('NDVI')

//экспорт файла
Export.image.toDrive({
  image:classified,
  description:'classifBurat',
  scale: 1000,
  folder:'Classif1km',
  region:ROI,
  maxPixels:21662189328 
})

Export.image.toDrive({
  image:img_ndvi,
  description:'NDVIburat',
  scale: 30,
  region:ROI,
  maxPixels:21662189328 
})
import { AfterContentInit, AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { BoxGeometry, BufferGeometry, Camera, Color, CurvePath, ExtrudeBufferGeometry, ExtrudeGeometry, Line, LineBasicMaterial, LineCurve, Material, Mesh, MeshBasicMaterial, MeshNormalMaterial, MeshPhongMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PointLight, Raycaster, Renderer, Scene, Shape, ShapeBufferGeometry, ShapeGeometry, Vector, Vector2, Vector3, Vector3Tuple, WebGLRenderer, DoubleSide, Texture, Plane, WebGLRenderTarget, TextureLoader, Intersection, CylinderGeometry, MeshMatcapMaterial, CircleGeometry, Group, TOUCH, MOUSE, BufferAttribute, ShapePath } from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry';			
import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { BehaviorSubject, concatMap, delay, exhaustMap, filter, forkJoin, from, interval, last, lastValueFrom, map, mapTo, merge, mergeMap, Observable, of, Subject, Subscriber, switchMap, take, tap, timeout, timer } from 'rxjs';
import { CategorySetting, CategorySettings } from 'src/app/shared/models/CategorySettings';
import { ActivatedRoute } from '@angular/router';
import { PinCategoryMappingService } from '../../pin-category-mapping.service';
import { SceneService } from './three-services/scene.service';
import { RendererService } from './three-services/renderer.service';
import { CameraService } from './three-services/camera.service';
import { AnimateService } from './three-services/animate.service';
import { LightService } from './three-services/light.service';
import { TileService } from './tile-services/tile.service';
import { TileUtilsService } from './tile-services/tile-utils.service';
import { TileLonglatCalculationService } from './tile-services/tile-longlat-calculation.service';
import { PinsTableService } from './pin-services/pins-table.service';
import { PinModelService } from './pin-services/pin-model.service';
import { Column3dService } from './column-3d-services/column-3d.service';
import { Tile } from 'src/app/shared/models/Tile';
import { Pin, PinWithDnc } from 'src/app/shared/models/Pin';
import { CategoryService } from './category/category.service';
import { Gui3dSettings } from 'src/app/shared/models/GuiColumnSettings';
import { PinUtilsService } from './pin-services/pin-utils.service';
import { Polygon } from 'src/app/shared/models/Polygon';
import { GuiPolygonSettings } from 'src/app/shared/models/GuiPolygonSettings';



@Component({
  selector: 'app-map-canvas',
  templateUrl: './map-canvas.component.html',
  styleUrls: ['./map-canvas.component.sass']
})
export class MapCanvasComponent implements OnInit, AfterViewInit {

  constructor(
    private sceneService: SceneService,
    private rendererService: RendererService,
    private cameraService: CameraService,
    private animateService: AnimateService,
    private lightService: LightService,
    private tileService: TileService,
    private tileUtilsService: TileUtilsService,
    private tileLonLatCalculation: TileLonglatCalculationService,
    private categoryService: CategoryService,
    private activatedRoute: ActivatedRoute,
    private pinModelService: PinModelService,
    private pinUtilsService: PinUtilsService,
    private column3dService: Column3dService,
    ) {
    this.initQueueToUpdateResolution()
    
  }

  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLCanvasElement>;
  scene: Scene = new Scene()
  renderer: WebGLRenderer = new WebGLRenderer()
  camera: Camera = new PerspectiveCamera()
  orbitControl!: OrbitControls
  box?: Object3D
  box2?: Object3D
  ground!: Object3D
  mousePosition: Vector2 = new Vector2(0, 0)
  plane!: Object3D
  tiles: Tile[] = []
  lines: Line<BufferGeometry, LineBasicMaterial>[] = []
  onUserUpdateCamera: Subject<string> = new BehaviorSubject('')
  queueToUpdateResolution!: Observable<string>
  tilesToMerge: Tile[] = []
  pins: Pin[] = []
  isPaused: boolean = false
  categoryId = '-N-SyzGWgpgWs2szH-aH'
  hoveringPins?: Pin[]
  hoverPinChangeSuject: BehaviorSubject<Pin[]> = new BehaviorSubject(([] as Pin[]))
  font!: Font
  @Output() hoverOnPin: EventEmitter<{pin: Pin, legendPosition: Vector2}| undefined> = new EventEmitter()
  @Output() selectedPinsOnGui: EventEmitter<PinWithDnc[]> = new EventEmitter()
  canvasDimention = new Vector2(600, 450)
  screenRatio = 2
  selectedPins: Pin[] = []
  polygons: Polygon[] = []

  // view
  guiColumnSettings:Gui3dSettings = {
    column: {
      opacity: 0.1,
      color: '#528bff',
      heightScale: 1,
      scale: 0.5,
    }, 
    ground: {
      color: '#528bff',
      opacity: 0.5,  
    }, 
    outline: {
      color: '#ffffff',
      opacity: 0.02,
    }
  }
  guiPolygonSettings:GuiPolygonSettings = {
      color: '#528bff',
      opacity: 0.6
  }
  

  initQueueToUpdateResolution = () => {
    this.queueToUpdateResolution = new Observable(subscriber => {
      this.tileService.updateTilesResolution(this.tiles, this.scene, this.camera).then(next => {
        this.tiles = next
        subscriber.next()
      })
    })
  }

  uiUpdatePin = (event: Event) => this.pinModelService.updatePin3ds(this.pins, this.scene, this.guiColumnSettings)

  async ngOnInit(): Promise<void> {
    this.hoverPinChangeSuject.subscribe( nextHoverPins => {
      this.hoveringPins = this.column3dService.updateHoverPins(nextHoverPins, this.guiColumnSettings, this.hoveringPins, this.selectedPins)
    })
    this.timeoutToPause()
    this.initOnUserUpdateResolution()
    this.animateService.onMouseIntersect.subscribe( intersections => this.onMouseIntersect(intersections))
    // this.pins = await this.pinModelService.initPinsModel()
    
    // this.pointDimensionService.writeUserData()
  }

  onMouseIntersect = (intersections: Intersection[]) => {
    const pinIds = this.pinUtilsService.getPinIdsFromIntersections(intersections)
    const pins = this.pinUtilsService.findPinById(this.pins, pinIds)
    this.changeLegendText(pins[0])
    this.onPinsHovered(pins)
  }

  onPinsHovered = (pins:Pin[]) => {
    pins = pins.slice(0,1)
    const groups = this.pinUtilsService.mappingToGroups(pins) as Group[]
    const isAnyPinHovered =pins.length > 0
    this.column3dService.setDepthWrite(groups, isAnyPinHovered, ['column', 'ground'])
    const isChanged = !this.pinUtilsService.isSamePins(this.hoveringPins || [], pins)
    if(isChanged) {
      this.hoverPinChangeSuject.next(pins)
    }
  }

  changeLegendText = (pin?: Pin) => {
    if (pin) {
      // this.mousePosition.x: -1~1
      // this.mousePosition.y: 1~-1
      const htmlAbsolutePosition = this.getPositionOnHtml(this.mousePosition, this.canvasDimention)
      this.hoverOnPin.emit({pin: pin, legendPosition: htmlAbsolutePosition})
    } else {
      this.hoverOnPin.emit()
    }
  }

  getPositionOnHtml = (mousePosition: Vector2, canvasDomention: Vector2) => { 
    const x = (mousePosition.x + 1) / 2 * canvasDomention.x // mousePosition.x: -1~1, which should map to canvas left(0) to right(600)
    const y = (mousePosition.y - 1) / 2 * canvasDomention.y // mousePosition.y: 1~-1, which should map to canvas top(0) to bottom(-450)
    return new Vector2(x,y)
  }

  initCategory = async () => {
    const categoryId = await this.getCategoryIdFromRoute()
    const onGotCategorySettings = async (setting: CategorySetting) => {
      this.pins = await this.pinModelService.applyPinHeightFromSetting(setting, this.pins)      
      await this.applySettings(setting)
    }
    await this.categoryService.getCategorySetting(categoryId, onGotCategorySettings)
  }

  applySettings = async (setting: CategorySetting) => this.guiColumnSettings = setting.options.meshSettings
  
  initOnUserUpdateResolution = () => {
    this.onUserUpdateCamera.pipe(
      switchMap(value => of(value).pipe(delay(1000))) // abandon too-frequent emission
    ).pipe(
      concatMap(() => this.queueToUpdateResolution.pipe(take(1))) // add emission to queue
    ).subscribe()
  }

  async ngAfterViewInit() {
    this.initThree()
    this.canvasContainer.nativeElement.addEventListener('mousewheel', this.onMouseScroll)
    this.canvasContainer.nativeElement.addEventListener('click', this.onMouseClick)
    this.pins = await this.pinModelService.initPinsModel()
    await this.initTile()
    await this.initCategory()
    this.pinModelService.updatePin3ds(this.pins, this.scene, this.guiColumnSettings)

    // const box = this.getBox(5)
    // const camera = this.camera
    // this.scene.add(box)
    // const projected = this.pinUtilsService.testProject(camera, box.position)
    
  }

  getCategoryIdFromRoute = async ():Promise<string> => {
    return new Promise( (resolve, reject) => {
      this.activatedRoute.paramMap.subscribe( param => {
        const id = param.get('id')
        if(!id) throw new Error("No param specified in router");
        resolve(id)
      })
    })
  }

  getBox = (size: number = 5) => {
    const boxGeo = new BoxGeometry(size, size, size)
    const boxMaterial = new MeshBasicMaterial({ color: 0xff0000 })
    const box = new Mesh(boxGeo, boxMaterial)
    return box
  }

  initThree = () => {
    this.scene = this.sceneService.makeScene()
    this.renderer = this.rendererService.makeRenderer(this.canvasContainer, this.canvasDimention)
    this.renderer.domElement.addEventListener('mousemove', this.onMouseMove)
    this.camera = this.cameraService.makeCamera(this.canvasDimention)
    this.scene.add(this.camera)
    this.orbitControl = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControl.target.set(0,5,50)
    this.orbitControl.update()
    this.orbitControl.listenToKeyEvents(window as any)
    // this.orbitControl.getDistance()
    this.orbitControl.keys = {
      LEFT: 'ArrowLeft', //left arrow
      UP: 'ArrowUp', // up arrow
      RIGHT: 'ArrowRight', // right arrow
      BOTTOM: 'ArrowDown' // down arrow
    }
    this.orbitControl.touches = {
      ONE: TOUCH.DOLLY_PAN,
      TWO: TOUCH.ROTATE,
    }
    // this.orbitControl.mouseButtons = {
      // LEFT: MOUSE.PAN,
      // MIDDLE: MOUSE.DOLLY,
      // RIGHT: MOUSE.ROTATE
    // }
    // this.orbitControl.maxDistance = 100
    // this.orbitControl.enableDamping = true
    this.orbitControl.addEventListener('change', this.onCameraChange)
    this.animateService.initAnimate(this.renderer, this.scene, this.camera, this.orbitControl, this.mousePosition)
    this.animateService.animate()
    this.box = this.getBox()
    this.plane = this.tileUtilsService.getPlane()
    this.plane.rotateX(-Math.PI * 0.5)
    this.plane.position.setY(-0.1)
    this.animateService.onFrameRender.subscribe(({ renderer, raycaster }) => {
    })
    this.lightService.makeLight(this.scene)
  }

  initTile = async () => {
    const tileIds = this.tileService.initTileIdsOfLevel8()
    const tiles = await this.tileUtilsService.getTileMeshById(tileIds)
    this.tileUtilsService.updateTileToRaycaster(tiles)
    this.tiles = tiles
    this.tileUtilsService.addTilesToScene(tiles, this.scene)
  }

  onMouseMove = async (event: MouseEvent) => {
    const newPosition = this.rendererService.updateMouse(event)
    this.mousePosition.set(newPosition.x, newPosition.y)
  }

  onMouseScroll = async () => {
    this.onUserUpdateCamera.next('')
  }

  onMouseClick = async () => {
    const isHoveringPins = this.hoveringPins && this.hoveringPins[0]
    if (isHoveringPins) {
      const clickedPin = this.hoveringPins![0]
      this.selectedPins = this.pinModelService.updateSelectedPins(clickedPin, this.selectedPins)
      this.updatePolygon(this.selectedPins)
      this.changePinStyleOnClick(clickedPin)
      this.onCameraChange()
    }
    this.onUserUpdateCamera.next('')
  }
  
  showUnprojectPosition = (camera: Camera, shaderCoordinate: Vector3) => {
    const reversed = this.pinUtilsService.testUnproject(camera, new Vector3(shaderCoordinate.x, shaderCoordinate.y, shaderCoordinate.z))
    const box = this.getBox(3)
    box.position.set(reversed.x, reversed.y, reversed.z)
    this.scene.add(box)
  }

  changePinStyleOnClick = (pin: Pin) => {
    const clickedGroup = pin.mesh
    if (!clickedGroup) return
    const column = this.pinUtilsService.getPinMeshInGroup(clickedGroup, 'column')
    column.material.color = new Color(0x1a3875)
  }

  onCameraChange = () => {
    const pinsWithDnc = this.pinUtilsService.getPinsDnc(this.selectedPins, this.canvasDimention, this.camera)
    this.selectedPinsOnGui.emit(pinsWithDnc)
  }

  uiUpdatePolygon = (event: Event) => this.updatePolygon(this.selectedPins)

  updatePolygon = (selectedPins: Pin[]) => {
    this.removePolygons()
    const pinCount: number = selectedPins.length
    const useRectangleMode = pinCount%3 === 1 && pinCount/3 > 1
    const everyThreePins = pinCount - pinCount%3
    const pinsToMakeTriangles = selectedPins.slice(0,everyThreePins)
    this.createTriangles(pinsToMakeTriangles)
    if (useRectangleMode) {
      const lastFourPoints = selectedPins.slice(-4)
      this.createRectangles(lastFourPoints)
    }
  }

  removePolygons = () => {
    this.polygons.forEach( polygon => {
      if (!polygon.mesh) throw new Error("no mesh to remove");
      polygon.mesh.removeFromParent()
    })
    this.polygons = []
  }

  createRectangles = (points: Pin[]) => {
    console.log(points);
    
    const model = this.createPolygonModel(points, 'rectangle')
    model.mesh = this.createRectangleMesh(model)
    this.scene.add(model.mesh)
    this.polygons.push(model)
  }

  createTriangles = (points: Pin[]) => {
    for (let i = 0; i < points.length; i+=3) {
      const polygonPoints = points.slice(i,i+3)
      const model = this.createPolygonModel(polygonPoints, 'triangle')
      model.mesh = this.createPolygonMesh(model)
      this.scene.add(model.mesh)
      this.polygons.push(model)
    }
  }

  createPolygonModel = (pointPins:Pin[], idPrefix: string):Polygon => {
    const polygonId = pointPins.map(pin => pin.id).join('_')
    return {
      id: `polygon_${idPrefix}_${polygonId}`,
      points: pointPins,
      color: this.column3dService.parseStringColorToInt(this.guiPolygonSettings.color),
      opacity: this.guiPolygonSettings.opacity
    }
  }

  createRectangleMesh = (model: Polygon) => {    
    const pointPositions = model.points.map( pin => {
      if (!pin.position3d) throw new Error("a pin has no position when creating triangle polygon");
      return pin.position3d
    })
    const totallVector = pointPositions.reduce( (prev, curr) => prev.clone().add(curr))
    const center = totallVector.multiplyScalar(0.25)
    const positionWithSlope = pointPositions.map( (points,i) => {
      const pToCenter3d = points.clone().sub(center)
      const p0ToCenter2d = new Vector2(pToCenter3d.x, pToCenter3d.z)
      const slope = Math.atan2(p0ToCenter2d.y, p0ToCenter2d.x)
      return {
        position3d: points,
        slope: slope/Math.PI
      }
    })
    const clockwisePoints3D = positionWithSlope.sort( (a,b) => a.slope - b.slope)
    const clockwisePoints2D = clockwisePoints3D.map( ({position3d, slope}): [number, number] => {
      return [position3d.x, position3d.z]
    })
    console.log(clockwisePoints2D);
    const shape = new Shape();
    shape.moveTo(...clockwisePoints2D[0])
    shape.lineTo(...clockwisePoints2D[1])
    shape.lineTo(...clockwisePoints2D[2])
    shape.lineTo(...clockwisePoints2D[3])
    shape.lineTo(...clockwisePoints2D[0])
    const geometry = new ShapeGeometry( shape );
    geometry.rotateX(Math.PI* 0.5)
    const material = new MeshPhongMaterial( { color: model.color, opacity: model.opacity, transparent: true , side: DoubleSide} );
    const mesh = new Mesh( geometry, material );
    mesh.name = model.id
    mesh.position.setY(0.005+Math.random()*0.01)
    
    return mesh
  }

  createPolygonMesh = (model: Polygon) => {
    const pointPositions = model.points.map( pin => {
      if (!pin.position3d) throw new Error("a pin has no position when creating triangle polygon");
      return pin.position3d
    })
    const bufferArray = pointPositions.map( point => point.toArray()).flat()
    const vertices = new Float32Array( bufferArray );
    const geometry = new BufferGeometry();
    geometry.setAttribute( 'position', new BufferAttribute( vertices, 3 ) );
    const material = new MeshPhongMaterial( { color: model.color, opacity: model.opacity, transparent: true , side: DoubleSide} );
    const mesh = new Mesh( geometry, material );
    mesh.name = model.id
    mesh.position.setY(0.005+Math.random()*0.001)
    return mesh
  }

  pauseAnimation = () => {
    this.isPaused = true
    this.animateService.pauseAnimation()
  }

  resumeAnimation = () => {
    this.isPaused = false
    this.animateService.resumeAnimation()
    this.timeoutToPause()
  }

  timeoutToPause = () => {
    setTimeout(() => {
      this.pauseAnimation()
    }, 20 * 1000);
  }


}

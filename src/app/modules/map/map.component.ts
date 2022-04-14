import { AfterContentInit, AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { TileId } from 'src/app/shared/models/TileId';
import { BoxGeometry, BufferGeometry, Camera, Color, CurvePath, ExtrudeBufferGeometry, ExtrudeGeometry, Line, LineBasicMaterial, LineCurve, Material, Mesh, MeshBasicMaterial, MeshNormalMaterial, MeshPhongMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PointLight, Raycaster, Renderer, Scene, Shape, ShapeBufferGeometry, ShapeGeometry, Vector, Vector2, Vector3, Vector3Tuple, WebGLRenderer, DoubleSide, Texture, Plane, WebGLRenderTarget, TextureLoader, Intersection, CylinderGeometry, MeshMatcapMaterial } from 'three';
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { AnimateService } from './three-services/animate.service';
import { CameraService } from './three-services/camera.service';
import { LightService } from './three-services/light.service';
import { RendererService } from './three-services/renderer.service';
import { SceneService } from './three-services/scene.service';
import { TileService } from './tile-services/tile.service';
import { Tile } from 'src/app/shared/models/Tile';
import { BehaviorSubject, concatMap, delay, exhaustMap, filter, forkJoin, from, interval, last, lastValueFrom, map, mapTo, merge, mergeMap, Observable, of, Subject, Subscriber, switchMap, take, tap, timeout, timer } from 'rxjs';
import { TileUtilsService } from './tile-services/tile-utils.service';
import { Pin } from 'src/app/shared/models/Pin';
import { TileLonglatCalculationService } from './tile-services/tile-longlat-calculation.service';
import { PinsTableService } from './point-services/pins-table.service';
import { CategoryService } from './category.service';
import { CategorySetting, CategorySettings } from 'src/app/shared/models/CategorySettings';
import { CategoryTableRow } from 'src/app/shared/models/CategoryTableRow';
import { ActivatedRoute } from '@angular/router';
import { PinModelService } from './pin-model.service';



@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.sass']
})
export class MapComponent implements OnInit, AfterViewInit {

  constructor(
    private sceneService: SceneService,
    private rendererService: RendererService,
    private cameraService: CameraService,
    private animateService: AnimateService,
    private lightService: LightService,
    private tileService: TileService,
    private tileUtilsService: TileUtilsService,
    private tileLonLatCalculation: TileLonglatCalculationService,
    private pinsTableService: PinsTableService,
    private categoryService: CategoryService,
    private activatedRoute: ActivatedRoute,
    private pinModelService: PinModelService,
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
  columnHeightScale = 0.1
  categoryId = '-N-SyzGWgpgWs2szH-aH'

  // view
  wireframeOpacity = 0.1
  additiveBlendingOpacity = 0.1
  normalBlendingOpacity = 0.1
  color = '#ff0000'
  

  initQueueToUpdateResolution = () => {
    this.queueToUpdateResolution = new Observable(subscriber => {
      this.tileService.updateTilesResolution(this.tiles, this.scene, this.camera).then(next => {
        this.tiles = next
        subscriber.next()
      })
    })
  }

  changeColumnHeight = (event: Event) => {
    this.updatePins(this.pins, this.scene)
  }

  sliderChange = (event: Event, option:string) => {
    console.log(event, option);
    switch (option) {
      case 'wireframeOpacity':
        this.pins.forEach( pin => {
          pin.mesh?.children.forEach( child => {
            const isWireframe = child.name.match('wireframe')
            if(isWireframe) {
              console.log(child, isWireframe);
              (<Mesh<CylinderGeometry, MeshPhongMaterial>>child).material.opacity = this.wireframeOpacity
            }
          })
        })
        break;
      case 'normalBlending':
        this.pins.forEach( pin => {
          pin.mesh?.children.forEach( child => {
            const iSnormalBlending = child.name.match('normalBlending')
            if(iSnormalBlending) {
              console.log(child, iSnormalBlending);
              (<Mesh<CylinderGeometry, MeshPhongMaterial>>child).material.opacity = this.normalBlendingOpacity
            }
          })
        })
      break;
      case 'additiveBlending':
        this.pins.forEach( pin => {
          pin.mesh?.children.forEach( child => {
            const isAdditiveBlending = child.name.match('additiveBlending')
            if(isAdditiveBlending) {
              console.log(child, isAdditiveBlending);
              (<Mesh<CylinderGeometry, MeshPhongMaterial>>child).material.opacity = this.additiveBlendingOpacity
            }
          })
        })
        break;
      case 'color':
        this.pins.forEach( pin => {
          pin.mesh?.children.forEach( child => {
              (<Mesh<CylinderGeometry, MeshPhongMaterial>>child).material.color = new Color(this.color)
          })
        })
        break;
    
      default:
        break;
    }
  }

  async ngOnInit(): Promise<void> {
    this.timeoutToPause()
    this.initOnUserUpdateResolution()
    this.pins = await this.pinModelService.initPinsModel()
    await this.initCategory()
    
    // this.pointDimensionService.writeUserData()
  }

  initCategory = async () => {
    const categoryId = await this.getCategoryIdFromRoute()
    this.getCategorySettingAndApply(categoryId, this.pins)
  }

  getCategorySettingAndApply = (id: string, pins: Pin[]) => {
    this.categoryService.getCategorySettings().subscribe( async (categorySettings: CategorySettings) => {
      const setting = categorySettings[id]  
      const categoryTable = await this.getCategoryTableFromSetting(setting)
      const { mappedPins, mappedRows } = this.mappingPinAndTable(categoryTable, pins)
      this.pins = this.pinModelService.updatePinHeightInModel(mappedPins, mappedRows)
      this.updatePins(this.pins, this.scene)
    })
  }

  mappingPinAndTable = (rows: CategoryTableRow[], pins: Pin[]) => {
    const unmappedPins = this.filterMappedPins(rows, pins, true)
    const unmappedRows = this.filterMappedRows(rows, pins, true)
    const mappedPins = this.filterMappedPins(rows, pins, false)
    const mappedRows = this.filterMappedRows(rows, pins, false)
    return {mappedPins, mappedRows}
  }

  filterMappedRows = (rows: CategoryTableRow[], pins: Pin[], filterUnmapped: boolean) => {
    const unmappedRow = rows.filter( row => {      
      const rowExistsInPin = pins.some( pin => pin.title === row.title)
      return filterUnmapped ? !rowExistsInPin : rowExistsInPin
    })
    return unmappedRow
  }

  filterMappedPins = (rows: CategoryTableRow[], pins: Pin[], filterUnmapped: boolean) => {
    const unmappedPin = pins.filter( pin => {
      const pinExistsInRow = rows.some( row => pin.title === row.title)
      return filterUnmapped ? !pinExistsInRow : pinExistsInRow
    })
    return unmappedPin
  }

  getCategoryTableFromSetting = async (setting: CategorySetting) => {
    if (!setting) throw new Error("No firebase category found by the route of this page");
    const tableId = setting.tableSource
    const tableObservable = this.categoryService.getCategoryTable(tableId)
    const categoryTable = await lastValueFrom(tableObservable)
    return categoryTable
  }

  initOnUserUpdateResolution = () => {
    this.onUserUpdateCamera.pipe(
      switchMap(value => of(value).pipe(delay(1000))) // abandon too-frequent emission
    ).pipe(
      concatMap(() => this.queueToUpdateResolution.pipe(take(1))) // add emission to queue
    ).subscribe()
  }

  async ngAfterViewInit() {
    this.initThree()
    await this.initTile()    
    this.updatePins(this.pins, this.scene)
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

  getBox = () => {
    const boxGeo = new BoxGeometry(5, 5, 5)
    const boxMaterial = new MeshBasicMaterial({ color: 0xff0000 })
    const box = new Mesh(boxGeo, boxMaterial)
    return box
  }

  initThree = () => {
    const canvasDimention = new Vector2(600, 450)
    this.scene = this.sceneService.makeScene()
    this.renderer = this.rendererService.makeRenderer(this.canvasContainer, canvasDimention)
    this.renderer.domElement.addEventListener('mousemove', this.onMouseMove)
    this.canvasContainer.nativeElement.addEventListener('mousewheel', this.onMouseScroll)
    this.canvasContainer.nativeElement.addEventListener('mouseup', this.onMouseUp)
    this.camera = this.cameraService.makeCamera(canvasDimention)
    this.scene.add(this.camera)
    this.orbitControl = new OrbitControls(this.camera, this.renderer.domElement);
    console.log(this.renderer, this.scene, this.camera, this.orbitControl, this.mousePosition);
    
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

  onMouseUp = async () => {
    this.onUserUpdateCamera.next('')
  }

  updatePins = (pins: Pin[], scene:Scene) => {
    this.removePins(pins)
    this.initPins(pins, scene)
  }

  initPins = (pins: Pin[], scene: Scene) => {
    pins.forEach( pin => {
      if (!pin.positionLongLat) throw new Error("No Longitude or latitude");
      pin.position3d = this.longLatToPosition3d(pin.positionLongLat)
      const columnGroup = this.getColumn3dLayers(pin)
      
      pin.mesh = columnGroup      
      scene.add(columnGroup)
    })
  }

  removePins = (pins: Pin[]) => {
    pins.forEach( pin => {
      if (!pin.mesh) return
      pin.mesh.removeFromParent()
    })
  }

  longLatToPosition3d = (lonLat: Vector2) => {
    const long = lonLat.x
    const lat = lonLat.y
    const tileX = this.tileLonLatCalculation.lon2tile(long,8)
    const tileY = this.tileLonLatCalculation.lat2tile(lat,8)
    const scenePositionX = (tileX - this.tileUtilsService.initTileId.x) * 12
    const scenePositionY = (tileY - this.tileUtilsService.initTileId.y) * 12
    const position = new Vector3(scenePositionX, 0, scenePositionY)
    return position
  }

  getColumn3dLayers = (pin: Pin) => {
    const group = new THREE.Group();
    const origionalMesh = this.getColumn3d(pin, THREE.NormalBlending, false, `column_${pin.id}_normalBlending`, 0.2, this.color)
    const lightingMesh = this.getColumn3d(pin, THREE.AdditiveBlending, false, `column_${pin.id}_additiveBlending`, 0.2, this.color)
    const edges = new THREE.EdgesGeometry( origionalMesh.geometry );
    const line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color: 0xffffff, opacity: 0.4, transparent: true } ) );
    group.add( line );
    group.add(origionalMesh)
    group.add(lightingMesh)
    return group
  }

  getColumn3d = (pin: Pin, blending: any, wireframe: boolean, name:string, opacity: number, color: string):Mesh<CylinderGeometry, MeshPhongMaterial> => {
    if (!pin.position3d) throw new Error("No Longitude or latitude when initing mesh");
    let material
    const colorR = color.slice(1,3)
    const colorG = color.slice(3,5)
    const colorB = color.slice(5,7)
    const colorNumber = `0x${colorR}${colorG}${colorB}`
    if (wireframe) {
      material = new MeshPhongMaterial( {
        transparent: true,
        opacity: 0.05,
        color: parseInt(colorNumber, 16),
        wireframe: true,
      })
    } else {
      material = new MeshPhongMaterial( {
        transparent: true,
        opacity: 0.2,
        color: parseInt(colorNumber, 16),
        blending: blending,
        side: DoubleSide
      })
    }
    const bottomRadius = pin.radius
    const topRadius = pin.radius
    const height = pin.height * Math.pow(this.columnHeightScale, 2)
    const radialSegments = 18
    const heightSegments = 5
    const geometry = new CylinderGeometry( bottomRadius, topRadius, height, radialSegments, heightSegments, false, )
    const mesh = new Mesh(geometry, material)
    const normalizedHeight = pin.position3d.y + height / 2
    mesh.geometry.translate(pin.position3d.x,normalizedHeight-0.01,pin.position3d.z)
    mesh.name = name
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
      console.log('animation paused');
    }, 10 * 1000);
  }


}

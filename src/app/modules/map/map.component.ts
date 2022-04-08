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
import { TextureService } from './tile-services/texture.service';
import { BehaviorSubject, concatMap, delay, exhaustMap, filter, forkJoin, from, interval, last, lastValueFrom, map, mapTo, merge, mergeMap, Observable, of, Subject, Subscriber, switchMap, take, tap, timeout, timer } from 'rxjs';
import { TileUtilsService } from './tile-services/tile-utils.service';
import { Point } from 'src/app/shared/models/Point';
import { TileLonglatCalculationService } from './tile-services/tile-longlat-calculation.service';
import { GoogleSheetRawData } from 'src/app/shared/models/GoogleSheetRawData';
import { HttpClient } from '@angular/common/http';
import { GeoencodingRaw } from 'src/app/shared/models/Geoencoding';
import { PointFromSheet } from 'src/app/shared/models/PointFromSheet';
import { PointDataMappingLonLat } from 'src/app/shared/models/PointDataMappingLonLat';
import { PointDataMappingGeoencodingRaw as PointDataMappingGeoencodingRaw } from 'src/app/shared/models/PointFromSheetMappingGeoendodingRaw';
import { PointLocationsService } from './point-services/point-locations.service';
import { PointDimensionService } from './point-services/point-dimension.service';



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
    private pointDataService: PointLocationsService,
    private pointDimensionService: PointDimensionService,
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
  points: Point[] = []

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

  sliderChange = (event: Event, option:string) => {
    console.log(event, option);
    switch (option) {
      case 'wireframeOpacity':
        this.points.forEach( point => {
          point.mesh?.children.forEach( child => {
            const isWireframe = child.name.match('wireframe')
            if(isWireframe) {
              console.log(child, isWireframe);
              (<Mesh<CylinderGeometry, MeshPhongMaterial>>child).material.opacity = this.wireframeOpacity
            }
          })
        })
        break;
      case 'normalBlending':
        this.points.forEach( point => {
          point.mesh?.children.forEach( child => {
            const iSnormalBlending = child.name.match('normalBlending')
            if(iSnormalBlending) {
              console.log(child, iSnormalBlending);
              (<Mesh<CylinderGeometry, MeshPhongMaterial>>child).material.opacity = this.normalBlendingOpacity
            }
          })
        })
      break;
      case 'additiveBlending':
        this.points.forEach( point => {
          point.mesh?.children.forEach( child => {
            const isAdditiveBlending = child.name.match('additiveBlending')
            if(isAdditiveBlending) {
              console.log(child, isAdditiveBlending);
              (<Mesh<CylinderGeometry, MeshPhongMaterial>>child).material.opacity = this.additiveBlendingOpacity
            }
          })
        })
        break;
      case 'color':
        this.points.forEach( point => {
          point.mesh?.children.forEach( child => {
              (<Mesh<CylinderGeometry, MeshPhongMaterial>>child).material.color = new Color(this.color)
          })
        })
        break;
    
      default:
        break;
    }
  }

  async ngOnInit(): Promise<void> {
    this.initOnUserUpdateResolution()
    this.pointDimensionService.loadDimensions().subscribe( next => {
      console.log(next);
    })
    this.pointDimensionService.writeUserData()
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
    this.pointDataService.getGoogleSheetInfo().subscribe( dataFromSheet => {
      const pointsData = this.formatPointsData(dataFromSheet)
      this.points.push(...pointsData)
      this.updatePoints(this.points)
    })
  }

  formatPointsData = (dataFromSheet: PointDataMappingLonLat[]):Point[] => {
    const formatPosition3d = (lonLat: Vector2) => {
      return new Vector3(lonLat.x, 0 , lonLat.y)
    }
    const formatTilePosition = (lonLat: Vector2) => {
      const lon = lonLat.x
      const lat = lonLat.y
      const tileX = this.tileLonLatCalculation.lat2tile(lat, 8)
      const tileY = this.tileLonLatCalculation.lon2tile(lon, 8)
      return new Vector2(tileX, tileY)
    }

    return dataFromSheet.map( point => {
      return {
        id: point.pointData.id,
        height: 0.3,
        color: 0xff195d,
        title: point.pointData.title,
        address: point.pointData.address,
        position3d: formatPosition3d(point.lonLat),
        positionTile: formatTilePosition(point.lonLat),
        positionLongLat: point.lonLat,
        radius: 0.1
      }
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
    this.animateService.animate(this.renderer, this.scene, this.camera, this.orbitControl, this.mousePosition, 600)
    this.animateService.initAnimate(this.renderer)
    this.box = this.getBox()
    this.plane = this.tileUtilsService.getPlane()
    this.plane.rotateX(-Math.PI * 0.5)
    this.plane.position.setY(-0.1)
    // this.scene.add(this.box)
    // this.scene.add(this.plane)

    this.animateService.onFrameRender.subscribe(({ renderer, raycaster }) => {
      // console.log(this.camera.position);
      // this.camera.position
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
    this.animateService.updateMouse(newPosition)
    this.mousePosition.set(newPosition.x, newPosition.y)
  }

  onMouseScroll = async () => {
    this.onUserUpdateCamera.next('')
  }

  onMouseUp = async () => {
    this.onUserUpdateCamera.next('')
  }

  updatePoints = (points: Point[]) => {
    points.forEach( point => {
      if (!point.mesh) return
      point.mesh.removeFromParent()
    })
    points.forEach( point => {
      if (!point.positionLongLat) throw new Error("No Longitude or latitude");
      point.position3d = this.longLatToPosition3d(point.positionLongLat)
      const columnGroup = this.getColumn3dLayers(point)
      point.mesh = columnGroup      
      this.scene.add(columnGroup)
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

  getColumn3dLayers = (point: Point) => {
    const group = new THREE.Group();
    const origionalMesh = this.getColumn3d(point, THREE.NormalBlending, false, `column_${point.id}_normalBlending`, 0.2, this.color)
    const lightingMesh = this.getColumn3d(point, THREE.AdditiveBlending, false, `column_${point.id}_additiveBlending`, 0.2, this.color)
    const edges = new THREE.EdgesGeometry( origionalMesh.geometry );
    const line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color: 0xffffff, opacity: 0.4, transparent: true } ) );
    group.add( line );
    group.add(origionalMesh)
    group.add(lightingMesh)
    return group
  }

  getColumn3d = (point: Point, blending: any, wireframe: boolean, name:string, opacity: number, color: string):Mesh<CylinderGeometry, MeshPhongMaterial> => {
    if (!point.position3d) throw new Error("No Longitude or latitude when initing mesh");
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
    const bottomRadius = point.radius
    const topRadius = point.radius
    const height = point.height
    const radialSegments = 18
    const heightSegments = 5
    const geometry = new CylinderGeometry( bottomRadius, topRadius, height, radialSegments, heightSegments, false, )
    const mesh = new Mesh(geometry, material)
    const normalizedHeight = point.position3d.y + height / 2
    mesh.geometry.translate(point.position3d.x,normalizedHeight-0.01,point.position3d.z)
    mesh.name = name
    return mesh
  }

  getMockGeoLonLat = (address: string, title: string): Observable<{raw: GeoencodingRaw, title: string}> => {
    let randomDelay = Math.floor(Math.random()*5000)
    return of(
      {"results": [
        {
            "address_components": [
                {
                    "long_name": "2樓",
                    "short_name": "2樓",
                    "types": [
                        "subpremise"
                    ]
                },
                {
                    "long_name": "3號",
                    "short_name": "3號",
                    "types": [
                        "street_number"
                    ]
                },
                {
                    "long_name": "Beiping West Road",
                    "short_name": "Beiping W Rd",
                    "types": [
                        "route"
                    ]
                },
                {
                    "long_name": "黎明里",
                    "short_name": "黎明里",
                    "types": [
                        "administrative_area_level_4",
                        "political"
                    ]
                },
                {
                    "long_name": "Zhongzheng District",
                    "short_name": "Zhongzheng District",
                    "types": [
                        "administrative_area_level_3",
                        "political"
                    ]
                },
                {
                    "long_name": "Taipei City",
                    "short_name": "Taipei City",
                    "types": [
                        "administrative_area_level_1",
                        "political"
                    ]
                },
                {
                    "long_name": "Taiwan",
                    "short_name": "TW",
                    "types": [
                        "country",
                        "political"
                    ]
                },
                {
                    "long_name": "100",
                    "short_name": "100",
                    "types": [
                        "postal_code"
                    ]
                }
            ],
            "formatted_address": "100, Taiwan, Taipei City, Zhongzheng District, Beiping W Rd, 3號2樓",
            "geometry": {
                "location": {
                    "lat": 25.0477467,
                    "lng": 121.5169983
                },
                "location_type": "ROOFTOP",
                "viewport": {
                    "northeast": {
                        "lat": 25.0490956802915,
                        "lng": 121.5183472802915
                    },
                    "southwest": {
                        "lat": 25.04639771970849,
                        "lng": 121.5156493197085
                    }
                }
            },
            "place_id": "ChIJxeVZh3KpQjQR0ESgIfL9Ug0",
            "types": [
                "subpremise"
            ]
        }
      ],
        "status": "OK"
      } as GeoencodingRaw).pipe( delay(randomDelay), map( next => {return {raw: next, title: title}}))
  }


}

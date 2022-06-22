import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { HttpMap } from 'src/app/shared/models/MapHttp';
import { Pin, PinWithDnc } from 'src/app/shared/models/Pin';
import { Polygon } from 'src/app/shared/models/Polygon';
import { Color, Vector2, Vector3 } from 'three';
import { MapHttpService } from '../../../shared/services/map-http/map-http.service';
import { PinsTableService } from './map-canvas/pin-services/pins-table.service';

@Component({
  selector: 'app-map-viewer',
  templateUrl: './map-viewer.component.html',
  styleUrls: ['./map-viewer.component.sass']
})
export class MapViewerComponent implements OnInit {

  constructor(
    private activatedRoute: ActivatedRoute,
    private mapHttpService: MapHttpService,
    private pinsTableService: PinsTableService,
    private animateService: AnimateService
  ) { }

  hoverPin?: { pin: Pin, legendPosition: Vector2 }
  selectedPin: { pin: Pin, legendPosition: Vector2 }[] = []
  pinsSelectedWithDnc: PinWithDnc[] = []
  averageMoving: Vector2[] = []
  pins: Pin[] = []
  pinSelected?: Pin[]
  isLoadingTile = false
  mapTitle: string = ""
  mapModelFromDb!: HttpMap
  hoverLogo = false
  showResetPosition = false
  resetCooldown = false
  isAddPinSheetShow = false

  hideAddPinSheet = () => {
    
    this.isAddPinSheetShow = !this.isAddPinSheetShow
  }


  changeHoverLegend = (options?: { pin: Pin, legendPosition: Vector2 }) => {
    this.hoverPin = options
  }

  getDefaultCategoryFromDb = async () => {
    const mapId = this.activatedRoute.snapshot.paramMap.get("id")
    if(mapId !== null && +mapId !== NaN) {
      const map: HttpMap = await lastValueFrom(this.mapHttpService.getMap(+mapId))
      return map
    } else {
      throw new Error("map id is not a number");
    }
  }
  

  async ngOnInit(): Promise<void> {
    this.animateService.removeAllIntersetObject()
    this.mapModelFromDb = await this.getDefaultCategoryFromDb()
    this.mapTitle = this.mapModelFromDb.mapName
    
    if (this.mapModelFromDb.pinSheetId) {
      const pinSheet = await lastValueFrom(this.pinsTableService.getAddressFromSourceSheet(this.mapModelFromDb.pinSheetId))
      console.log(pinSheet);
      if(!pinSheet) throw new Error("no sheet source table id found");
    } else {
      this.beginAddPinSheetFlow()
      throw new Error("no sheet source id found");
    }
  }

  onPinSelected = (pins: Pin[]) => {
    const newList = [...pins]
    this.pinSelected = newList
  }

  onSelectedPinsWithDnc = (pinsWithDnc: any) => {
    this.pinsSelectedWithDnc.forEach( (pin,i) => {
      const isExist = Boolean(pinsWithDnc[i])
      if (isExist) {
        const nextPosition = pinsWithDnc[i].deviceCoordinate.clone()
        const thisPosition = pin.deviceCoordinate
        const lerp = nextPosition.sub(thisPosition).multiplyScalar(0.3)
        pinsWithDnc[i].deviceCoordinate = pin.deviceCoordinate.clone().add(lerp)
      }
    })
    this.pinsSelectedWithDnc = pinsWithDnc
  }

  polygonUpdate = (polygons: Polygon[]) => {
    console.log(polygons);
  }

  onLoadingTile = (isLoading: boolean) => {
    this.isLoadingTile = isLoading
  }

  onCameraPositionCanReset = (canShow: boolean) => {
    if (canShow && !this.resetCooldown) {
      this.showResetPosition = true
    } else {
      this.showResetPosition = false
      this.resetCooldown = true
      setTimeout(() => {
        this.resetCooldown = false
      }, 1000);
    }
  }

  beginAddPinSheetFlow = () => {
    this.isAddPinSheetShow = true
  }
}

import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore/lite';
import { getDatabase, ref, onValue, Database, push } from "firebase/database";
import { environment } from 'src/environments/environment';
import { lastValueFrom, map, Observable, of, timeout } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { CategorySetting, CategorySettings } from 'src/app/shared/models/CategorySettings';
import { CategoryTableRow } from 'src/app/shared/models/CategoryTableRow';
import { GoogleSheetRawData, GoogleSheetRow } from 'src/app/shared/models/GoogleSheetRawData';
import { PinsTableService } from '../pin-services/pins-table.service';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  constructor(
    private httpClient: HttpClient,
    private pointLocationsService: PinsTableService,
  ) {
    this.firebaseConfig = environment.firebaseConfig
    this.dataBase = this.initFirebase()
  }

  firebaseConfig
  dataBase: Database

  initFirebase = () => {
    const firebaseApp = initializeApp(this.firebaseConfig);
    const database = getDatabase(firebaseApp);
    return database
  }

  getCategorySettings = ():Observable<CategorySettings> => {
    const starCountRef = ref(this.dataBase, '/pointTables');
    return new Observable(subscribe => {
      onValue(starCountRef, (snapshot) => {
        const data:CategorySettings = snapshot.val();
        subscribe.next(data)
      });
    })
  }

  getCategorySetting = async (id: string, onFinished: (setting: CategorySetting) => Promise<void>) => {
    // this.categoryService.subscribe( async (categorySettings: CategorySettings) => {   
      const categorySettings: CategorySettings = {
        "-N-SyzGWgpgWs2szH-aH": {
            "deleted": true,
            "options": {
                "cameraPosition": {
                    "x": 10,
                    "y": 20,
                    "z": 0
                },
                "colors": {
                    "mainColor": "#ff00ff"
                },
                "meshSettings": {
                  "columns": {
                    "defaultColumn": {
                      "opacity": 0.1,
                      "color": "#528bff",
                      "heightScale": 0.1,
                      "scale": 0.5
                    },
                    "hoveredColumn": {
                      "opacity": 1,
                      "color": "#d2abff",
                    },
                    "selectedColumn": {
                      "opacity": 0.4,
                      "color": "#528bff",
                    },
                  },
                  "polygon": {
                    "opacity": 0.6,
                    "color": "#528bff",
                  },
                  "ground": {
                    "color": "#528bff",
                    "opacity": 0.5,
                  },
                  "outline": {
                    "color": "#ffffff",
                    "opacity": 0.02,
                  }
                },
                "connectMode": "triangle",
                "connectedPoints": [
                    1,
                    2,
                    4
                ],
                "focusOnPoint": {
                    "x": -10,
                    "y": 0,
                    "z": 0
                },
                "radius": 2
            },
            "tableCreateDate": "2022/04/12",
            "tableCreator": "Umas",
            "tableName": "店營業額",
            "tableSource": "1ER4MhRBniLOaNZ8_vkgv92Egp410nf-z-CkN9KO1LGg"
        }
      }
      const setting = categorySettings[id]  
      await lastValueFrom(of(true).pipe(timeout(1000)))
      await onFinished(setting)   
      
    // })
  }
  getCategoryTable = (googleSheetId: string): Observable<CategoryTableRow[]> => {
    const options = {responseType: 'text' as 'json',};
    return this.httpClient.get<GoogleSheetRawData>(`https://docs.google.com/spreadsheets/d/${googleSheetId}/gviz/tq?`, options).pipe(
      this.convertGoogleSheetToAddress,
    )
  }
  
  convertGoogleSheetToAddress = map((rawdata): CategoryTableRow[] => {
    rawdata = this.pointLocationsService.removeExtraText(rawdata as string)    
    const raw = <GoogleSheetRawData>JSON.parse(rawdata as string)    
    const sheetData: GoogleSheetRow[] = raw.table.rows
    const sheetBody: GoogleSheetRow[] = sheetData.filter((row, index) => row.c[0]?.v !== '落點名稱')
    const mapping: CategoryTableRow[] = this.formatingPointDimensionData(sheetBody)
    return mapping
  })

  formatingPointDimensionData = (sheetBody: GoogleSheetRow[]):CategoryTableRow[] => {
      return sheetBody.map((row, index) => {
        let title = ""
        let dimensionData = ""
        if (row.c) {
          title = row.c[0].v
          dimensionData = row.c[1].v
        }
        return {
          id: index,
          title: title,
          value: dimensionData,
        }
      })
    }
  
  writeUserData = () => {
    push(ref(this.dataBase, '/pointTables'), {
      tableName: 'tableName',
      tableCreator: 'tableCreator',
      tableCreateDate: 'tableCreateDate',
      tableSource: 'url',
      deleted: true,
      options: {
        colors: {
          mainColor: '#ff00ff'
        },
        radius: 2,
        columnHeight: 1.5,
        focusOnPoint: { x: 0, y: 0, z: 0},
        cameraPosition: { x: 0, y: 0, z: 0},
        connectMode: 'triangle',
        connectedPoints: [1,2,4]
      }
    })
  }

  getTableFromSettings = async (setting: CategorySetting) => {
    if (!setting) throw new Error("No firebase category found by the route of this page");
    const tableId = setting.tableSource
    const tableObservable = this.getCategoryTable(tableId)
    const categoryTable = await lastValueFrom(tableObservable)
    return categoryTable
  }

}

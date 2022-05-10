import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Route, Router } from '@angular/router';
import { lastValueFrom, take } from 'rxjs';
import { CategorySetting, CategorySettings, CategorySettingWithId } from 'src/app/shared/models/CategorySettings';
import { CategoryService } from '../map-canvas/category/category.service';
import { AnimateService } from '../map-canvas/three-services/animate.service';

@Component({
  selector: 'app-category-picker',
  templateUrl: './category-picker.component.html',
  styleUrls: ['./category-picker.component.sass']
})
export class CategoryPickerComponent implements OnInit {

  constructor(
    private animateService: AnimateService,
    private categoryService: CategoryService,
    private router: Router,
  ) { }

  blurSource: string = ''
  categoriesMappedId: CategorySettingWithId[] = []
  isAddCategoryShow: boolean = false
  isAddNameShow:boolean = false
  addingSheetUrl?: string


  async ngOnInit(): Promise<void> {
    this.categoryService.getCategorySettings().subscribe(categoriesObj => {
      const categoriesMappedId: CategorySettingWithId[] = []
      for (const categoryName in categoriesObj) {
        const category = categoriesObj[categoryName]
        const CategoryMappedId: CategorySettingWithId = { categoryId: categoryName, ...category }
        categoriesMappedId.push(CategoryMappedId)
      }
      console.log(categoriesMappedId);
      this.categoriesMappedId = categoriesMappedId
      categoriesMappedId[0].tableName
    })
  }

  isShow: boolean = true

  toggleShow = () => {
    this.isShow = !this.isShow
    if (this.isShow) {
      this.animateService.getCavasImage().pipe(take(1)).subscribe(value => {
        this.blurSource = `url(${value})`
      })
    }
  }

  categoryChanged = (category: CategorySetting, id: string) => {
    this.router.navigate(['/map', `/${id}`])
  }

  showAddCategory = () => this.isAddCategoryShow = !this.isAddCategoryShow

  nameMoveLastSetp = () => {
    this.toggleAddName()
    this.showAddCategory()
  }

  onGotSheetUrl = (url: string) => {
    console.log(url); 
    this.addingSheetUrl = url
    this.toggleAddName()
  }

  toggleAddName = () => this.isAddNameShow = !this.isAddNameShow

  onGotName = (name: string) => {
    const defaultSetting = this.categoryService.mockSetting
    defaultSetting.tableName = name
    if(!this.addingSheetUrl) throw new Error("no google sheet url before creating new category on database");
    defaultSetting.tableSource = this.addingSheetUrl
    this.categoryService.addCategory(defaultSetting)
  }

}

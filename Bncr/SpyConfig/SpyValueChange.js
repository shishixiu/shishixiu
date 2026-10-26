/**
 * @name SpyValueChange
 * @version v1.0.1
 * @author Aming
 * @origin 红灯区
 * @create_at 2033-10-27 11:12:09
 * @description 篡改监听到的变量
 * @module true
 * @public false
 * @disable true
 */

 module.exports = async envObject => {
  console.log('需要改变的变量:', envObject);
  /* 格式为key变量名,val变量值
  {
      key: 'M_WX_POINT_DRAW_URL',
      val: 'https://cjhy-isv.isvjcloud.com/mc/wxPointShopView/pointExgShiWu?giftId=109668ef5a7f4e80ab88fd396087ec04&giftType=3&adsource=cjhdc&venderId=1000003168'
  } 
  */

  /*
  写你的判断逻辑
  
  */
  /* 判断完毕返回一个 {key:xxx,val:xxx}对象 
  如果返回值格式 有问题/逻辑判断超过60s/报错 均会强制返回原始Object
  */
  return await valueTransferUrl(envObject);
};

/**
* id转url 暂时只支持单个变量转换
* 修改记录
* 版本号[1.0.1] 修订日期[2023/5/3 9:57 PM] author[Doraemon] 修改内容 [适配多变量篡改]
* @author Doraemon
* @param {*} envObject envObject
* @returns 
*/
async function valueTransferUrl (envObject) {
  let envKey = envObject.key;
  let envVal = envObject.val;

  list().some((item) => {
      const transArr = item.trans;
      return transArr.some((transItem) => {
          if (envKey === transItem.redi && envKey.startsWith(transItem.redi) && item.fullUrl) {
           if (transItem.ori.includes(' ')) {
             const [paramNames, fullUrl] = [transItem.ori.split(' '), item.fullUrl];
             if (!fullUrl) return true;
         
             const envValArr = envVal.split(transItem.sep);
             const paramMap = new Map();
             paramNames.forEach((paramName, i) => {
               if (paramName) paramMap.set(paramName, envValArr[i]);
             });
         
             let processedUrl = fullUrl;
             paramMap.forEach((paramValue, paramName) => {
               const placeholder = '${' + paramName + '}';
               processedUrl = processedUrl.replace(placeholder, paramValue);
             });
         
             return true;
           } else {
             envVal = `${item.fullUrl}${envVal}`;
             return true;
           }
          }
      });
  });
  return {
      key: envKey,
      val: envVal
  };
}

/**
* 配置需要id转url的数组
* 主要参数：
* redi 需要转换的id
* fullUrl 对应的地址
* 修改记录
* 版本号[1.0.1] 修订日期[2023/5/3 9:57 PM] author[Doraemon] 修改内容 [增加jinggeng邀请入会有礼篡改示例]
* @author Doraemon
* 
*/
function list() {
 return [
     {
            name: '打豆豆',
            trans: [
                {
                    redi: 'jd_wxgame_activityId',
                },
                {
                    redi: 'WXGAME_ACT_ID',
                },
            ],
            fullUrl: 'https://lzkj-isv.isvjcloud.com/wxgame/activity?activityId=',
        },
        {
            name: 'LZ幸运抽奖',
            trans: [
                {
                    redi: 'jd_lzkj_wxDrawActivity_Id',
                },
            ],
            fullUrl: 'https://lzkj-isv.isvjcloud.com/lzclient/1680278562076/cjwx/common/entry.html?activityId=',
        },
        {
            name: 'CJ幸运抽奖',
            trans: [
                {
                    redi: 'jd_cjhy_wxDrawActivity_Id',
                },
            ],
            fullUrl: 'https://cjhy-isv.isvjcloud.com/wxDrawActivity/activity/activity?activityId=',
        },
        {
            name: 'LZ加购有礼',
            trans: [
                {
                    redi: 'jd_lzaddCart_activityId',
                },
                {
                    redi: 'jd_lzkj_wxCollectionActivityId',
                },
            ],
            fullUrl: 'https://lzkj-isv.isvjcloud.com/wxCollectionActivity/activity2?activityId=',
        },
        {
            name: 'CJ加购有礼',
            trans: [
                {
                    redi: 'jd_cjhy_wxCollectionActivityId',
                },
            ],
            fullUrl: 'https://cjhy-isv.isvjcloud.com/wxCollectionActivity/activity?activityId=',
        },
        {
            name: 'LZ组队瓜分',
            trans: [
                {
                    redi: 'jd_zdjr_activityId',
                },
                {
                    redi: 'jd_lzkjdz_wxTeam_Id',
                },
            ],
            fullUrl: 'https://lzkjdz-isv.isvjcloud.com/wxTeam/activity2/875406?activityId=',
        },
        {
         name: 'CJ组队瓜分',
         trans: [
             {
                 redi: 'jd_cjhy_activityId',
             },
             {
		 redi: 'jd_cjhydz_wxTeam_Id',
            },
             {
                 redi: 'cjzlzd_custom',
             },
             {
                 redi: 'jd_task_sdzd8_custom',
             },
             {
                 redi: 'jd_task_cjzlzd_custom',
             },
        ],
        fullUrl: 'https://cjhydz-isv.isvjcloud.com/wxTeam/activity?activityId=',
    },
    {
        name: 'LZ分享有礼',
        trans: [
            {
                redi: 'jd_fxyl_activityId',
            },
            {
                redi: 'jd_wxShareActivity_activityId',
            },
        ],
        fullUrl: 'https://lzkjdz-isv.isvjcloud.com/wxShareActivity/activity?activityId=',
    },
    {
        name: 'LZ集卡抽奖',
        trans: [
            {
                redi: 'jd_wxCollectCard_activityId',
            },
        ],
        fullUrl: 'https://lzkjdz-isv.isvjcloud.com/wxCollectCard/activity?activityId=',
    },
    {
        name: 'LZ店铺游戏',
        trans: [
            {
                redi: 'jd_lzkj_wxGameActivity_activityId',
            },
        ],
        fullUrl: 'https://lzkj-isv.isvjcloud.com/wxGameActivity/activity?activityId=',
    },
    {
        name: 'CJ店铺游戏',
        trans: [
            {
                redi: 'jd_cjhy_wxGameActivity_activityId',
            },
        ],
        fullUrl: 'https://cjhy-isv.isvjcloud.com/wxGameActivity/activity?activityId=',
    },
    {
        name: 'LZ读秒手速',
        trans: [
            {
                redi: 'jd_wxSecond_activityId',
            },
        ],
        fullUrl: 'https://lzkjdz-isv.isvjcloud.com/wxSecond/activity?activityId=',
    },
    {
        name: 'LZ知识超人',
        trans: [
            {
                redi: 'jd_lzkj_wxKnowledgeActivity_activityId',
            },
        ],
        fullUrl: 'https://lzkj-isv.isvjcloud.com/wxKnowledgeActivity/activity?activityId=',
    },
    {
        name: 'CJ知识超人',
        trans: [
            {
                redi: 'jd_cjhy_wxKnowledgeActivity_activityId',
            },
        ],
        fullUrl: 'https://cjhy-isv.isvjcloud.com/wxKnowledgeActivity/activity?activityId=',
    },
    {
        name: 'LZ盖楼领奖',
        trans: [
            {
                redi: 'jd_wxBulidActivityId',
            },
            {
                redi: 'jd_wxBuildActivity_activityId',
            },
            {
                redi: 'jd_lzkj_wxBuildActivity_activityId',
            },
        ],
        fullUrl: 'https://lzkj-isv.isvjcloud.com/wxBuildActivity/activity?activityId=',
    },
    {
        name: 'LZ关注抽奖',
        trans: [
            {
                redi: 'jd_lzkj_wxShopFollowActivity_activityId',
            },
        ],
        fullUrl: 'https://lzkj-isv.isvjcloud.com/wxShopFollowActivity/activity?activityId=',
    },
    {
        name: 'CJ关注抽奖',
        trans: [
            {
                redi: 'jd_cjhy_wxShopFollowActivity_activityId',
            },
        ],
        fullUrl: 'https://cjhy-isv.isvjcloud.com/wxShopFollowActivity/activity?activityId=',
    },
    {
        name: 'LZ粉丝互动',
        trans: [
            {
                redi: 'jd_wxFansInterActionActivity_activityId',
            },
        ],
        fullUrl: 'https://lzkjdz-isv.isvjd.com/wxFansInterActionActivity/activity?activityId=',
    },
    {
        name: 'LZ老虎机抽奖',
        trans: [
            {
                redi: 'jd_drawCenter_activityId',
            },
        ],
        fullUrl: 'https://lzkj-isv.isvjcloud.com/drawCenter/activity?activityId=',
    },
    {
        name: 'LZ购物车锦鲤',
        trans: [
            {
                redi: 'jd_wxCartKoi_activityId',
            },
        ],
        fullUrl: 'https://lzkjdz-isv.isvjcloud.com/wxCartKoi/cartkoi/activity?activityId=',
    },
    {
        name: 'CJ生日等级礼包',
        trans: [
            {
                redi: 'jd_wxBirthGiftsId',
            },
            {
                redi: 'jd_cjhy_wxMcLevelAndBirthGifts_ids',
            },
            {
                redi: 'jd_wxMcLevelAndBirthGifts_activityId',
            },
        ],
        fullUrl: 'https://cjhy-isv.isvjcloud.com/mc/wxMcLevelAndBirthGifts/activity?activityId=',
    },
    {
        name: 'LZ关注有礼无线',
        trans: [
            {
                redi: 'jd_wxShopGiftId',
            },
            {
                redi: 'jd_lzkj_wxShopGift_ids',
            },
            {
                redi: 'PKC_TXGZYL',
            },
        ],
        fullUrl: 'https://lzkj-isv.isvjcloud.com/wxShopGift/activity?activityId=',
    },
    {
        name: 'CJ关注有礼无线',
        trans: [
            {
                redi: 'jd_cjhy_wxShopGift_ids',
            },
        ],
        fullUrl: 'https://cjhy-isv.isvjcloud.com/wxShopGift/activity?activityId=',
    },
    {
        name: 'txzj幸运抽奖',
        trans: [
            {
                redi: 'jd_txzj_lottery_id',
            },
        ],
        fullUrl: 'https://txzj-isv.isvjcloud.com/lottery/home?a=',
    },
    {
        name: 'txzj加购有礼',
        trans: [
            {
                redi: 'jd_txzj_cart_item_id',
            },
        ],
        fullUrl: 'https://txzj-isv.isvjcloud.com/cart_item/home?a=',
    },
    {
        name: 'txzj关注有礼',
        trans: [
            {
                redi: 'jd_txzj_collect_item_id',
            },
        ],
        fullUrl: 'https://txzj-isv.isvjcloud.com/collect_item/home?a=',
    },
    {
        name: 'loreal邀请入会',
        trans: [
            {
                redi: 'jd_loreal_interact_yqrhyl_activityId',
            },
            {
                redi: 'jd_lzkj_interact_yqrhyl_activityId',
            },
        ],
        fullUrl: 'https://lorealjdcampaign-rc.isvjcloud.com/interact/index?activityType=10006&templateId=20201228083300yqrhyl01&nodeId=101001005&prd=crm&activityId=',
    },
    {
        name: 'interact加购有礼',
        trans: [
            {
                redi: 'jd_lzkj_interactsaas_glyl_Ids',
            },
        ],
        fullUrl: 'https://lzkj-isv.isvjcloud.com/prod/cc/interactsaas/?activityType=10024&templateId=20210518190900jgyl011&nodeId=101001&prd=cjwx&activityId=',
    },
    {
        name: 'interact盖楼有礼',
        trans: [
            {
                redi: 'jd_lzkj_interactsaas_glyl_Ids',
            },
        ],
        fullUrl: 'https://lzkj-isv.isvjcloud.com/prod/cc/interactsaas/index?activityType=10047&templateId=20210714190900glyl011&nodeId=101001047&prd=cjwx&activityId=',
    },
    {
        name: 'interact关注商品',
        trans: [
            {
                redi: 'jd_lzkj_interactsaas_gzspyl_activityId',
            },
        ],
        fullUrl: 'https://lzkj-isv.isvjcloud.com/prod/cc/interactsaas/?activityType=10053&templateId=20210804190900gzspyl011&nodeId=101001053&prd=cjwx&activityId=',
    },
    {
        name: 'interact关注抽奖',
        trans: [
            {
                redi: 'jd_lzkj_interactsaas_gzyl_activityId',
            },
        ],
        fullUrl: 'https://lzkj-isv.isvjcloud.com/prod/cc/interactsaas/index?activityType=10069&templateId=ac8b6564-aa35-4ba5-aa62-55b0ce61b5d01&nodeId=101001&prd=cjwx&activityId=',
    },
    {
        name: 'interact邀请入会',
        trans: [
            {
                redi: 'jd_lzkj_interactsaas_yqhyrh_activityId',
            },
        ],
        fullUrl: 'https://lzkj-isv.isvjcloud.com/prod/cc/interactsaas/index?activityType=10070&templateId=7fab7995-298c-44a1-af5a-f79c520fa8a888&nodeId=101001&prd=cjwx&activityId=',
    },
    {
       name: 'jinggeng邀请入会有礼',
       trans: [
         {
           ori: 'id user_id',
           redi: 'jinggengInviteJoin',
           sep: '&',
         },
       ],
       fullUrl: 'http://jinggeng-isv.isvjcloud.com/ql/front/showInviteJoin?id=${id}&user_id=${user_id}'
     },
  ]
}

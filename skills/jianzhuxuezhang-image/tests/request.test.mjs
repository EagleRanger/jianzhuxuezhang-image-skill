import test from 'node:test';
import assert from 'node:assert/strict';
import {request,clean,submitOnce,prepare} from '../scripts/browser-workflow.mjs';
test('用户默认与别名锁定准确版本，不降为GPT2',()=>{
 assert.equal(request().model,'GPT-image-2.5'); assert.equal(request().resolution,'2k');
 assert.equal(request({model:'GPT'}).model,'GPT-image-2.5');
 assert.equal(request({model:'豆包'}).model,'Seedream 5.0 Pro');
 assert.equal(request({model:'千问'}).model,'qwen-image-3.0');
 assert.equal(request({model:'GPT-image-2'}).model,'GPT-image-2');
 assert.equal(clean('GPT-image-2.5new'),'GPT-image-2.5');
});
test('旧模式和无效张数不能被静默接受',()=>{
 assert.throws(()=>request({mode:'快速'})); assert.throws(()=>request({count:4}));
});
test('首页参数不能用于生产提交，已提交不能重试',async()=>{
 await assert.rejects(prepare({url:async()=> 'https://www.jianzhuxuezhang.com/ai/banana_modifier'},{}),/resets settings/);
 await assert.rejects(submitOnce({}, {status:'accepted'}),/never retry/);
});

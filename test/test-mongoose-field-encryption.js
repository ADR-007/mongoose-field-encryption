'use strict';

const expect = require('chai').expect;

const Promise = require('bluebird');
const mongoose = require('mongoose');
mongoose.Promise = Promise;

const fieldEncryptionPlugin = require('../lib/mongoose-field-encryption').fieldEncryption;

const uri = process.env.URI || 'mongodb://localhost/mongoose-field-encryption-test';

describe('mongoose-field-encryption plugin', () => {

  let FieldEncryptionSchema = new mongoose.Schema({
    toEncrypt1: { type: String, required: true },
    toEncrypt2: { type: String, required: true }
  });

  FieldEncryptionSchema.plugin(
    fieldEncryptionPlugin, {
      fields: ['toEncrypt1', 'toEncrypt2'],
      secret: 'letsdothis' // should ideally be process.env.SECRET
    }
  );

  let FieldEncryption = mongoose.model('FieldEncryption', FieldEncryptionSchema);

  before(() => {
    return mongoose.connect(uri)
      .then(() => {
        return mongoose.connection.db.dropDatabase();
      });
  });

  after(() => {
    mongoose.connection.close()
  });

  describe('static methods', () => {
    it('should encrypt fields', () => {

      // given
      let sut = new FieldEncryption({
        toEncrypt1: 'some stuff',
        toEncrypt2: 'should be hidden'
      });

      // when
      sut.encryptFieldsSync();

      // then
      expect(sut.__enc_toEncrypt1).to.be.true;
      expect(sut.toEncrypt1).to.equal('b27d5768b82263ece8bd');
      expect(sut.__enc_toEncrypt2).to.be.true;
      expect(sut.toEncrypt2).to.equal('b27a5578f43537fbebfb2e365ab13977');

    });

    it('should not encrypt already encrypted fields', () => {

      // given
      let sut = new FieldEncryption({
        toEncrypt1: 'some stuff',
        toEncrypt2: 'should be hidden'
      });

      // when
      sut.encryptFieldsSync();
      sut.encryptFieldsSync();

      // then
      expect(sut.__enc_toEncrypt1).to.be.true;
      expect(sut.toEncrypt1).to.equal('b27d5768b82263ece8bd');
      expect(sut.__enc_toEncrypt2).to.be.true;
      expect(sut.toEncrypt2).to.equal('b27a5578f43537fbebfb2e365ab13977');

    });

    it('should decrypt fields', () => {

      // given
      let sut = new FieldEncryption({
        toEncrypt1: 'b27d5768b82263ece8bd',
        __enc_toEncrypt1: true,
        toEncrypt2: 'b27a5578f43537fbebfb2e365ab13977',
        __enc_toEncrypt2: true
      });

      // when
      sut.decryptFieldsSync();

      // then
      expect(sut.__enc_toEncrypt1).to.be.false;
      expect(sut.toEncrypt1).to.equal('some stuff');
      expect(sut.__enc_toEncrypt2).to.be.false;
      expect(sut.toEncrypt2).to.equal('should be hidden');

    });

    it('should ignore multiple decrypt field calls', () => {

      // given
      let sut = new FieldEncryption({
        toEncrypt1: 'b27d5768b82263ece8bd',
        __enc_toEncrypt1: true,
        toEncrypt2: 'b27a5578f43537fbebfb2e365ab13977',
        __enc_toEncrypt2: true
      });

      // when
      sut.decryptFieldsSync();
      sut.decryptFieldsSync();

      // then
      expect(sut.__enc_toEncrypt1).to.be.false;
      expect(sut.toEncrypt1).to.equal('some stuff');
      expect(sut.__enc_toEncrypt2).to.be.false;
      expect(sut.toEncrypt2).to.equal('should be hidden');

    });

  });

  describe('database', () => {
    it('should not encrypt non-string fields', done => {

      // given
      let NestedFieldEncryptionSchema = new mongoose.Schema({
        toEncrypt: {
          nested: { type: String, required: true }
        }
      });

      NestedFieldEncryptionSchema.plugin(fieldEncryptionPlugin, { fields: ['toEncrypt'], secret: 'icanhazcheezburger' });

      let NestedFieldEncryption = mongoose.model('NestedFieldEncryption', NestedFieldEncryptionSchema);

      let sut = new NestedFieldEncryption({
        toEncrypt: {
          nested: 'some stuff to encrypt'
        }
      });

      // when
      sut.save()
        .then(() => {
          done(new Error('should not have saved with a non-string field'));
        })
        .catch(err => {
          // then
          done();
        });
    });

    it('should encrypt fields on save and decrypt fields on findOne', () => {

      // given
      let sut = new FieldEncryption({
        toEncrypt1: 'some stuff',
        toEncrypt2: 'should be hidden'
      });

      // when
      return sut.save()
        .then(() => {
          expect(sut.__enc_toEncrypt1).to.be.true;
          expect(sut.toEncrypt1).to.equal('b27d5768b82263ece8bd');
          expect(sut.__enc_toEncrypt2).to.be.true;
          expect(sut.toEncrypt2).to.equal('b27a5578f43537fbebfb2e365ab13977');

          return FieldEncryption.findOne({ _id: sut._id });
        })
        .then(found => {
          expect(found.__enc_toEncrypt1).to.be.false;
          expect(found.toEncrypt1).to.equal('some stuff');
          expect(found.__enc_toEncrypt2).to.be.false;
          expect(found.toEncrypt2).to.equal('should be hidden');
        });
    });

    it('should store encrypted fields as plaintext on findOneAndUpdate', () => {

      // given
      let sut = new FieldEncryption({
        toEncrypt1: 'some stuff',
        toEncrypt2: 'should be hidden'
      });

      // when
      return sut.save()
        .then(() => {
          expect(sut.__enc_toEncrypt1).to.be.true;
          expect(sut.toEncrypt1).to.equal('b27d5768b82263ece8bd');
          expect(sut.__enc_toEncrypt2).to.be.true;
          expect(sut.toEncrypt2).to.equal('b27a5578f43537fbebfb2e365ab13977');

          return FieldEncryption.findOneAndUpdate({ _id: sut._id }, { $set: { toEncrypt1: 'snoop', __enc_toEncrypt1: false } }, { new: true });
        })
        .then(found => {
          // then
          expect(found.__enc_toEncrypt1).to.be.false;
          expect(found.toEncrypt1).to.equal('snoop');
          expect(found.__enc_toEncrypt2).to.be.false;
          expect(found.toEncrypt2).to.equal('should be hidden');
        });
    });

    it('should encrypt fields on update', () => {

      // given
      let sut = new FieldEncryption({
        toEncrypt1: 'some stuff',
        toEncrypt2: 'should be hidden'
      });

      // when
      return sut.save()
        .then(() => {
          expect(sut.__enc_toEncrypt1).to.be.true;
          expect(sut.toEncrypt1).to.equal('b27d5768b82263ece8bd');
          expect(sut.__enc_toEncrypt2).to.be.true;
          expect(sut.toEncrypt2).to.equal('b27a5578f43537fbebfb2e365ab13977');

          return FieldEncryption.update({ _id: sut._id }, { $set: { toEncrypt1: 'snoop', __enc_toEncrypt1: false } });
        })
        .then(() => {
          return FieldEncryption.findById(sut._id);
        })
        .then(found => {
          // then
          expect(found.__enc_toEncrypt1).to.be.false;
          expect(found.toEncrypt1).to.equal('snoop');
          expect(found.__enc_toEncrypt2).to.be.false;
          expect(found.toEncrypt2).to.equal('should be hidden');
        });
    });

  });

});
